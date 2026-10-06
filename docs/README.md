# KanjiTest 專案文檔

KanjiTest 是無登入的日文漢字讀音測驗網站。網站與 HTTP API 部署在 Cloudflare Pages；個人單字、書籤、進度與統計保存在瀏覽器。維護工具箱在本機執行。

| 文檔 | 用途 |
| --- | --- |
| [系統架構](architecture.md) | 模組分工、測驗流程、建置與部署邊界 |
| [開發與驗證](development.md) | 環境、啟動、測試、變更位置與故障處理 |
| [工具箱與發布](deployment.md) | 按鈕、命令列、Git 分支、預覽／正式環境、回復版本 |
| [資料與題庫](data.md) | localStorage、備份、抽題演算法、題庫來源與校驗限制 |
| [HTTP API](api.md) | 請求、回應、狀態碼及快取規則 |
| [協作規則](../AGENTS.md) | 維護與交付檢查 |

## 開始使用

需要 Node.js 22 或以上。專案的執行與測試無 npm 套件相依，CI 使用 Node.js 24。Wrangler 在部署時由 npx 取得；題庫重建工具另需 Python，日常測驗、工具箱及發布不需要 Python。

Windows 雙擊儲存庫根目錄的 `toolbox.cmd`，或執行：

```sh
npm run toolbox
```

工具箱開啟 `http://127.0.0.1:8025`，提供完整驗證、部署預覽版、部署正式版及提交／推送。部署按鈕都先跑測試與建置，任一步失敗就停止後續步驟。

開發測驗網站：

```sh
npm run verify
npm run dev
```

開啟 `http://127.0.0.1:8015`。工具箱與測驗網站是不同的本機服務。

## 目前功能與範圍

- N1–N5、全部、書籤或自訂題庫，選擇 1–100 題，Enter 作答並自動前進。
- 加權且同字形不重複抽題，保留上一題解答，支援提前結束。
- 本輪完整結算、只顯示錯題、錯題重練、再來一輪與重新設定。
- 自訂單字編輯、書籤、搜尋、JSON 備份及匯入。
- 7,989 筆來源 ID、6,896 個可測驗字形；讀音逐筆比對官方 JMdict。中文來源義項對齊與重點修正已完成，全部中文義項仍需獨立專業語意校對。
- GitHub Actions 執行同一套驗證；Cloudflare 發布由工具箱或命令列手動執行。

正式站：[kanjitest.pages.dev](https://kanjitest.pages.dev)。預覽站：[preview.kanjitest.pages.dev](https://preview.kanjitest.pages.dev)。
