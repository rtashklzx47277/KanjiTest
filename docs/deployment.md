# 工具箱與發布

## 工具箱

Windows 雙擊根目錄 `toolbox.cmd`，或執行 `npm run toolbox`。預設開啟 `http://127.0.0.1:8025`，顯示專案目錄、Git 分支、尚未提交的變更與執行紀錄。關閉終端機／Ctrl+C 結束服務；執行中的工作完成後再關閉。

| 按鈕 | 執行內容 |
| --- | --- |
| 開始驗證 | 全部 Node 測試 → 建置 |
| 部署預覽版 | 檢查分支 → 測試 → 建置 → Wrangler 預覽環境 |
| 部署正式版 | 檢查允許分支 → 測試 → 建置 → Wrangler 正式環境 |
| 提交／推送 | 暫存 repo 所有變更 → 有差異時提交 → 推送目前分支 |

任一步失敗停止後續步驟。工具箱一次執行一個工作，失敗後能重新執行；重新整理可接續查看正在執行的工作。提交與部署分開：推送不會自動上線，部署也不會自動提交、推送或合併 PR。

「提交／推送」會包含這個 repo 中所有未被 ignore 的變更，提交前可展開變更清單檢查。沒有新變更時略過提交，仍推送尚未推送的提交；訊息以 Git 的字面參數傳遞，不作為 shell 指令執行。

## 初次設定

1. 安裝 Node.js ≥22 和 Git，取得本 repo。
2. 在終端機完成 Wrangler 登入：`npx --yes wrangler@4 login`。
3. 確認現有 Cloudflare Pages 專案 `kanjitest` 可用。只有專案不存在時才建立：`npx --yes wrangler@4 pages project create kanjitest --production-branch=main`。
4. 確認 Git origin 指向自己的儲存庫，並在終端機完成所需 Git 認證。
5. 執行 `npm run verify` 或工具箱驗證，通過後發布預覽。

Wrangler 第一次使用需網路下載；本機工具箱不保存 Cloudflare token 或 Git 密碼，不把認證傳到測驗網站。現有工作站已設定的登入可直接沿用。

## 分支與環境

設定集中在 `tools/deployment.json`：

```json
{
  "projectName": "kanjitest",
  "productionBranch": "main",
  "previewBranch": "preview",
  "allowedProductionGitBranches": ["main", "codex/cloudflare-local-storage"]
}
```

`productionBranch` 是 **Cloudflare 環境標籤**，`allowedProductionGitBranches` 是 **可提供正式發布程式的 Git 分支**，兩者分開判斷。發布不會切分支或合併。

遷移尚在 Draft PR，因此暫時允許已在正式站使用的遷移分支，以及合併後的 `main`。其他功能分支可以發布預覽，正式按鈕停用、CLI 也會拒絕正式發布。遷移合併完成後，可把允許清單縮為 `["main"]`；不要在合併前誤將仍是舊 Go 版本的 Git main 當作新版來源。修改此設定後重啟工具箱，CLI 則每次重新載入。

原始碼 ZIP 不含 `.git`；測試與建置可直接執行，推送及受分支限制的部署需在包含新版程式的 Git 儲存庫執行。現有儲存庫可切換至遷移分支，或在 PR 合併後使用 main。

目前使用 Cloudflare **Direct Upload**。GitHub CI 只驗證，沒有 Cloudflare 自動拉取 GitHub 或自動發布工作流。

## 建議日常流程

修改 → 工具箱驗證 → 部署預覽 → 操作確認 → 提交／推送 → 部署正式 → 正式站確認。小改動可直接選正式部署，該按鈕仍會完整測試與重新建置。

命令列與按鈕共用相同流程：

```sh
npm run verify
npm run deploy:preview
npm run deploy
```

兩個部署指令都重新驗證，不會只上傳某個以前建立的 `dist`。發布固定從 repo 根執行，Wrangler 才能編譯根目錄 `functions/`，上傳網站及 API。

部署成功顯示環境網址與本次專屬網址。預覽為 `https://preview.kanjitest.pages.dev`，正式為 `https://kanjitest.pages.dev`。以本次網址檢查新版，再確認常用正式網址；版本內容、API 判分及個人資料操作應符合預期。

## 版本回復

保留最近正常的 commit 與 Cloudflare deployment URL。需要回復時，可在 Cloudflare dashboard 選擇已成功的部署回復，或在允許的 Git 分支以可審查的 revert 提交重跑測試、建置與正式部署。來源分支、測試結果及部署網址應記錄一致；不以強制推送覆蓋 Git 歷史。

發佈／回復靜態資源不會自動還原使用者 localStorage。若變更個人資料格式，須先設計相容遷移，不能依賴網站版本回復來復原個人資料。

參考：[Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[Pages Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)。Direct Upload 也可搭配自行設計的 CI 部署；本專案目前仍為手動發布。
