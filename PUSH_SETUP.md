# 簡潔記事 Android 推播設定

使用 Firebase Spark 免費方案 + Firebase Cloud Messaging + GitHub Actions 排程。不要升級 Blaze，也不要新增付款方式。

## Firebase 專案（建議由家長協助）
1. 到 https://console.firebase.google.com/ 建立專案，Analytics 可關閉。
2. 專案維持 Spark 免費方案。
3. 專案設定 > 一般 > 新增 Web App，取得 Firebase Web 設定。
4. 專案設定 > Cloud Messaging > Web Push certificates，取得 VAPID 公開金鑰。
5. Authentication > Sign-in method 啟用 Anonymous（匿名）登入。
6. 建立 Realtime Database，複製資料庫 URL。
7. 將 firebase-database.rules.json 內容貼到 Realtime Database > Rules 並發布。

## 網站設定
把 Web App 設定和 VAPID 公開金鑰填入根目錄 firebase-config.js。這些是公開設定，不能放服務帳戶私鑰。

## GitHub Actions 服務帳戶（家長協助）
1. 在 Google Cloud 專案建立專用服務帳戶。
2. 只授予讀寫 Firebase Realtime Database、發送 Firebase Cloud Messaging 所需的最小權限。
3. 建立 JSON 金鑰。這是機密，不要貼到聊天，也不要提交到 GitHub。
4. GitHub 專案 Settings > Secrets and variables > Actions 新增：
   - FIREBASE_SERVICE_ACCOUNT_JSON：整份 JSON 金鑰檔內容
   - FIREBASE_DATABASE_URL：Realtime Database URL
   - FIREBASE_PROJECT_ID：專案 ID
5. 確認 Firebase Cloud Messaging API 已啟用。

## 隱私與目前範圍
- 原有 LOCAL_DIARY、DEFAULT_EMOJI、EMOJI_PRESETS 仍留在手機，不會整份上傳。
- 啟用推播後，才會同步必要的提醒時間、標題和事項文字。
- 第一版排程以每 5 分鐘檢查一次，實際通知可能延遲，不是精準鬧鐘。
- 日期目前只有 MMDD，程式需將提醒排到下一個尚未到來的日期。
- 重複事項的展開提醒尚未包含在第一版。
- 未完成 Firebase 設定前，推播不會運作；workflow 會安全略過。
