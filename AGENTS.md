# KanjiTest 維護規則

## 專案與文檔

這個分支是 Cloudflare Pages＋Pages Functions 的無登入版本，網站使用原生 JavaScript、HTML／CSS，個人資料保存於 localStorage。專案文檔入口是 `docs/README.md`；題庫授權與校驗在 `data/NOTICE.md`、`data/AUDIT.md`。

## 修改與驗證

- 從 repo 根執行 `npm run verify`，共用測試與建置流程。CI 跑同一指令。UI 變更另外檢查實際操作、窄螢幕、鍵盤、空狀態及分頁。
- 個人資料規則放 `public/core.js`；API 規則放 `lib/api.js`；介面放 `public/app.js`。不要把伺服器狀態當成使用者的目前題目。
- 儲存成功後才更新記憶體與介面；保持取消／晚回覆答案不重複計分的行為。
- 保存資料格式變更須處理舊備份與輪次；不要刪掉舊內建 ID、任意重算已答快照或清除使用者資料。
- 原始題庫陣列供來源追溯；網站使用校正版。不要把 gikun 熟字訓當成錯誤讀音，也不要忽略字形與義項限制。中文來源對齊不代表全數專業語意校對。
- 不提交 `dist/`、`.wrangler/`、`node_modules/`、個人備份或認證資料。

## 發布與工具箱

`toolbox.cmd`／`npm run toolbox` 是本機維護入口。測試、部署預覽與正式部署共用 `tools/workflows.mjs`；正式來源分支見 `tools/deployment.json`。部署前必須通過完整測試與建置，失敗停止。

Git 分支和 Cloudflare `--branch` 環境標籤是兩個設定。遷移分支暫時允許正式發布；PR 未合併時 Git main 仍可能是舊 Go 版。不要為了發布而自行合併 PR 或切換到不相容來源。

提交／推送與部署分開。日常使用 `npm run deploy:preview`／`npm run deploy`；根目錄 `functions/` 由 Wrangler 一起編譯。工具箱不放進公開網站，傳入的提交訊息必須保持字面 argv，不串成 shell 命令。

改動架構、資料、API 或維護流程時同步更新 `docs/` 與 README；說明實際驗證及限制，不把來源一致性當成全數語意正確。
