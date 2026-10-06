# 開發與驗證

## 環境與啟動

需要 Node.js ≥22，CI 使用 24；日常開發不需 `npm install`。Git 用於版本控制，Wrangler 用於 Cloudflare 發布。題庫匯入／校驗工具才需要 Python；一般測驗及維護工具箱無 Python 相依。

從儲存庫根目錄執行：

```sh
npm run verify
npm run dev
```

開啟 `http://127.0.0.1:8015`。開發伺服器讀取 `dist`，改完前端或資料需再 `npm run build` 並重新整理；改動 API 或匯入的模組後須重啟伺服器。

驗證實際 Cloudflare runtime：

```sh
npx --yes wrangler@4 pages dev dist
```

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm test` | Node 全部測試 |
| `npm run build` | 只建置網站 |
| `npm run verify` | 測試 → 建置；任一步失敗停止 |
| `npm run toolbox` | 開啟本機維護介面 |
| `npm run deploy:preview` | 分支檢查 → 測試 → 建置 → 部署預覽 |
| `npm run deploy` | 正式來源分支檢查 → 測試 → 建置 → 部署正式 |

GitHub Actions 執行 `npm run verify`，與本機驗證一致，不執行部署。新增部署流程的回歸也只使用替代命令及本機 HTTP 測試，不實際上傳或推送。

## 修改位置

介面行為改 `public/app.js`，結構／樣式改 `index.html`／`style.css`；儲存、驗證及抽題規則改 `core.js`。API 規格改 `lib/api.js`，Pages 入口通常不需一起改。題庫校正見 [資料文檔](data.md)，不要因為移除重複題目就刪掉舊來源 ID。

工具箱頁面與測驗網站分開，維護命令放 `tools/workflows.mjs`。部署設定集中在 `tools/deployment.json`。新增流程時保留測試與建置的停止條件，不能從按鈕直接跳過驗證上傳。

## 檢查範圍

目前 55 項 Node 測試涵蓋 HTTP 狀態、詞庫／多讀音、資料與備份驗證、權重與去重、100 題紀錄、編輯快照、舊資料遷移，以及部署失敗停止、正式分支限制、提交訊息的字面參數、工具箱單工作與同來源要求。

UI 變更另外在瀏覽器檢查所改流程，包含桌面／窄螢幕、鍵盤、分頁與空狀態。測驗不得因提示或上一題解答出現而推擠位置。維護工具箱有獨立的桌面／手機檢查與實際驗證工作。

## 常見故障

| 狀況 | 處理 |
| --- | --- |
| 工具箱 port 已使用 | `node tools/toolbox.mjs --port=8026`；不自動關閉其他服務 |
| 不想自動開瀏覽器 | `node tools/toolbox.mjs --no-open` |
| 網站變更未出現 | 重建 `dist`、重新整理；必要時重啟開發伺服器 |
| localStorage 容量不足／權限拒絕 | 查看浮動提示，先匯出備份；失敗不會部分修改資料 |
| 舊資料損毀 | 保留原始備份，不直接覆寫或刪除；讀取失敗會進唯讀模式 |
| Wrangler／Git 要求互動登入 | 先在終端機完成登入，工具箱不接受互動認證輸入 |

不要把 `dist`、`.wrangler`、`node_modules`、個人備份或認證資料提交到 Git。
