# 簡潔記事 PWA

以原始「簡潔記事」HTML 程式為基礎，保留條列視圖、月曆視圖、時間軸、待辦管理、每週重複、Emoji 設定等功能，並加入 PWA 離線快取與 JSON 備份/還原。

## 資料儲存

- 事項資料仍使用原本的 `LOCAL_DIARY`。
- 預設 Emoji 使用 `DEFAULT_EMOJI`。
- 常用 Emoji 使用 `EMOJI_PRESETS`。
- 資料保存在目前瀏覽器／裝置的 localStorage，不會自動跨裝置同步。
- 建議定期到「設定」匯出 JSON 備份；清除瀏覽器網站資料可能會刪除本機資料。

## 部署到 GitHub Pages

此 Repository 已包含 GitHub Actions 部署流程。到 GitHub 專案的 **Settings → Pages**，將 **Build and deployment → Source** 設為 **GitHub Actions**。之後推送到 `main` 分支就會自動部署。

部署網址：
`https://yuanting0117a.github.io/simple-diary-pwa/`

## 安裝到手機

使用手機瀏覽器開啟部署網址：
- iPhone：Safari → 分享 → 加入主畫面
- Android：Chrome → 選單 → 安裝應用程式／加到主畫面
