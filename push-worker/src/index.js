import { buildPushPayload } from "@block65/webcrypto-web-push";

const APP_ORIGIN = "https://yuanting0117a.github.io";
const DEVICE_PREFIX = "device:";
const VAPID_KEY = "__vapid_keys";
const REMINDER_GRACE_MS = 10 * 60 * 1000;

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin === APP_ORIGIN) headers["Access-Control-Allow-Origin"] = APP_ORIGIN;
  return headers;
}

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getVapidKeys(env) {
  let keys = await env.REMINDERS.get(VAPID_KEY, "json");
  if (keys?.publicKey && keys?.privateKey) return keys;

  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  keys = {
    publicKey: base64url(publicBytes),
    privateKey: privateJwk.d,
    subject: "mailto:push@simple-diary-pwa.github.io"
  };
  await env.REMINDERS.put(VAPID_KEY, JSON.stringify(keys));
  return keys;
}

function validDeviceId(value) {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}

function getBearer(request) {
  const value = request.headers.get("Authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 100000) throw new Error("request_too_large");
  return JSON.parse(text);
}

function validSubscription(subscription) {
  return subscription &&
    typeof subscription.endpoint === "string" &&
    subscription.endpoint.startsWith("https://") &&
    typeof subscription.keys?.p256dh === "string" &&
    typeof subscription.keys?.auth === "string";
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64url(new Uint8Array(digest));
}

async function loadDevice(env, deviceId, token) {
  if (!validDeviceId(deviceId) || typeof token !== "string" || token.length < 32) return null;
  const record = await env.REMINDERS.get(DEVICE_PREFIX + deviceId, "json");
  if (!record || record.tokenHash !== await hashToken(token)) return null;
  return record;
}

async function sendPush(subscription, keys, title, body, url = "/") {
  const payload = await buildPushPayload({
    data: JSON.stringify({ title, body, url }),
    options: { ttl: 3600 }
  }, subscription, keys);
  return fetch(subscription.endpoint, payload);
}

async function handleRequest(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (origin && origin !== APP_ORIGIN) return json({ error: "origin_not_allowed" }, 403, origin);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true }, 200, origin);
  }

  if (request.method === "GET" && url.pathname === "/api/config") {
    const keys = await getVapidKeys(env);
    return json({ publicKey: keys.publicKey }, 200, origin);
  }

  if (request.method !== "POST") return json({ error: "not_found" }, 404, origin);

  let body;
  try {
    body = await readBody(request);
  } catch {
    return json({ error: "invalid_json_or_request_too_large" }, 400, origin);
  }

  if (url.pathname === "/api/register") {
    const { deviceId, deviceToken, subscription } = body || {};
    if (!validDeviceId(deviceId) || typeof deviceToken !== "string" || deviceToken.length < 32 || !validSubscription(subscription)) {
      return json({ error: "invalid_registration" }, 400, origin);
    }
    const key = DEVICE_PREFIX + deviceId;
    const existing = await env.REMINDERS.get(key, "json");
    const tokenHash = await hashToken(deviceToken);
    if (existing && existing.tokenHash !== tokenHash) return json({ error: "device_auth_failed" }, 401, origin);
    const record = existing || { tokenHash, sent: [], reminders: [] };
    record.subscription = subscription;
    await env.REMINDERS.put(key, JSON.stringify(record));
    return json({ ok: true }, 200, origin);
  }

  if (url.pathname === "/api/sync") {
    const { deviceId, reminders } = body || {};
    const record = await loadDevice(env, deviceId, getBearer(request));
    if (!record) return json({ error: "device_auth_failed" }, 401, origin);
    if (!Array.isArray(reminders) || reminders.length > 300) return json({ error: "invalid_reminders" }, 400, origin);
    const cleaned = [];
    for (const item of reminders) {
      if (!item || typeof item.id !== "string" || typeof item.title !== "string" ||
          typeof item.body !== "string" || !Number.isFinite(item.reminderAt) ||
          !Number.isFinite(item.startsAt)) continue;
      cleaned.push({
        id: item.id.slice(0, 180),
        title: item.title.slice(0, 100),
        body: item.body.slice(0, 300),
        reminderAt: item.reminderAt,
        startsAt: item.startsAt
      });
    }
    const oldSent = new Set(Array.isArray(record.sent) ? record.sent : []);
    const validIds = new Set(cleaned.map(item => item.id));
    record.sent = [...oldSent].filter(id => validIds.has(id)).slice(-500);
    record.reminders = cleaned;
    await env.REMINDERS.put(DEVICE_PREFIX + deviceId, JSON.stringify(record));
    return json({ ok: true, count: cleaned.length }, 200, origin);
  }

  if (url.pathname === "/api/test") {
    const { deviceId } = body || {};
    const record = await loadDevice(env, deviceId, getBearer(request));
    if (!record || !validSubscription(record.subscription)) return json({ error: "subscription_not_found" }, 404, origin);
    const reminderAt = Date.now() + 60 * 1000;
    const testId = "test-" + crypto.randomUUID();
    if (!Array.isArray(record.reminders)) record.reminders = [];
    record.reminders = record.reminders.filter(item => !String(item?.id || "").startsWith("test-"));
    record.reminders.push({
      id: testId,
      title: "簡潔記事｜推播測試",
      body: "雲端排程正常運作！這是約一分鐘前設定的測試通知。",
      reminderAt,
      startsAt: reminderAt
    });
    await env.REMINDERS.put(DEVICE_PREFIX + deviceId, JSON.stringify(record));
    return json({ ok: true, scheduledAt: reminderAt }, 200, origin);
  }

  if (url.pathname === "/api/unregister") {
    const { deviceId } = body || {};
    const record = await loadDevice(env, deviceId, getBearer(request));
    if (!record) return json({ error: "device_auth_failed" }, 401, origin);
    await env.REMINDERS.delete(DEVICE_PREFIX + deviceId);
    return json({ ok: true }, 200, origin);
  }

  return json({ error: "not_found" }, 404, origin);
}

async function runScheduled(env) {
  const keys = await getVapidKeys(env);
  const now = Date.now();
  let cursor;
  do {
    const page = await env.REMINDERS.list({ prefix: DEVICE_PREFIX, cursor, limit: 100 });
    for (const entry of page.keys) {
      const storageKey = entry.name;
      const record = await env.REMINDERS.get(storageKey, "json");
      if (!record || !validSubscription(record.subscription) || !Array.isArray(record.reminders)) continue;
      const sent = new Set(Array.isArray(record.sent) ? record.sent : []);
      let changed = false;

      for (const reminder of record.reminders) {
        if (!reminder || sent.has(reminder.id) || !Number.isFinite(reminder.reminderAt)) continue;
        if (reminder.reminderAt > now || reminder.reminderAt < now - REMINDER_GRACE_MS) continue;
        try {
          const result = await sendPush(record.subscription, keys, reminder.title, reminder.body);
          if (result.status === 404 || result.status === 410) {
            record.subscription = null;
            changed = true;
            break;
          }
          if (result.ok) {
            sent.add(reminder.id);
            changed = true;
          } else {
            console.warn("Push service response:", result.status);
          }
        } catch (error) {
          console.warn("Push delivery failed:", error);
        }
      }

      if (changed) {
        record.sent = [...sent].slice(-500);
        await env.REMINDERS.put(storageKey, JSON.stringify(record));
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error("Push worker request failed:", error);
      return json({ error: "internal_error" }, 500, request.headers.get("Origin") || "");
    }
  },
  async scheduled(controller, env) {
    await runScheduled(env);
  }
};
