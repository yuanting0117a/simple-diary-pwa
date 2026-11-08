import json, os, sys, time, urllib.error, urllib.parse, urllib.request
from google.oauth2 import service_account
from google.auth.transport.requests import Request

DB = os.environ["FIREBASE_DATABASE_URL"].rstrip("/")
PROJECT = os.environ["FIREBASE_PROJECT_ID"]
SA = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
SCOPES = ["https://www.googleapis.com/auth/firebase.messaging", "https://www.googleapis.com/auth/firebase.database"]

def call(url, method="GET", payload=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8','replace')}")

def main():
    cred = service_account.Credentials.from_service_account_info(SA, scopes=SCOPES)
    cred.refresh(Request())
    token = cred.token
    users = call(DB + "/users.json", token=token) or {}
    now = int(time.time() * 1000)
    sent = failed = 0

    for uid, user in users.items():
        if not isinstance(user, dict): continue
        devices = user.get("devices") or {}
        reminders = user.get("reminders") or {}
        tokens = [d.get("token") for d in devices.values() if isinstance(d, dict) and d.get("token")]
        for rid, reminder in reminders.items():
            if not isinstance(reminder, dict) or reminder.get("sent"): continue
            if not isinstance(reminder.get("scheduledAt"), (int, float)) or reminder["scheduledAt"] > now: continue
            ok = True
            for device_token in tokens:
                message = {"message": {
                    "token": device_token,
                    "notification": {
                        "title": str(reminder.get("title") or "簡潔記事提醒")[:80],
                        "body": str(reminder.get("body") or "有一項事項到了提醒時間。")[:180]
                    },
                    "webpush": {
                        "notification": {
                            "title": str(reminder.get("title") or "簡潔記事提醒")[:80],
                            "body": str(reminder.get("body") or "有一項事項到了提醒時間。")[:180],
                            "icon": "https://yuanting0117a.github.io/simple-diary-pwa/icons/icon.svg",
                            "tag": "diary-" + str(rid),
                            "renotify": False
                        },
                        "fcm_options": {"link": "https://yuanting0117a.github.io/simple-diary-pwa/"}
                    },
                    "data": {"reminderId": str(rid), "url": "https://yuanting0117a.github.io/simple-diary-pwa/"}
                }}
                try:
                    call(f"https://fcm.googleapis.com/v1/projects/{PROJECT}/messages:send", "POST", message, token)
                except Exception as e:
                    ok = False
                    failed += 1
                    print(f"提醒 {rid} 發送失敗：{e}", file=sys.stderr)
            if ok and tokens:
                reminder["sent"] = True
                reminder["sentAt"] = now
                path = "/users/" + urllib.parse.quote(uid, safe="") + "/reminders/" + urllib.parse.quote(str(rid), safe="")
                call(DB + path + ".json", "PUT", reminder, token)
                sent += 1
    print(f"完成：送出 {sent} 項提醒，失敗 {failed} 次。")

if __name__ == "__main__":
    main()
