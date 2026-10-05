# KanjiTest｜日文單字測驗

Cloudflare Pages 網頁＋Pages Functions HTTP API。無登入、無 PostgreSQL；自訂單字、書籤、設定、測驗進度、單字累計統計與最近 50 題答題歷史保存在瀏覽器的 `localStorage`。

## 功能

- 7,989 個內建單字：N5 852、N4 642、N3 1,790、N2 1,671、N1 3,034；保留原有 946 筆公開題庫與其 ID。
- 進入測驗先選難度／題庫、1–100 題，再按開始。同輪單字不重複；題庫不足時採實際可用題數。依歷次錯誤率加權，較常答錯的單字更容易被抽中。
- 答案確認後在同一卡片顯示本題解答，按下一題才前進；結果放大置中，「本題單字／你的答案」與「中文解釋／正確讀音」方便對照。讀音接受平假名、片假名與半形片假名。
- 本輪結算顯示正確率、正確／錯誤題數與完整紀錄（最多 100 題），可收藏、重練本輪錯題、以原難度／題數再來一輪或重新設定。測驗進度及結算可在重新整理後恢復。
- 新增／刪除自訂單字、加入／移除書籤、即時搜尋與分類練習。
- 齒輪設定可開啟「答錯時自動加入書籤」，預設關閉；只收藏錯誤答案，重複答錯不產生重複書籤。
- 答題歷史保存最近 50 題的時間、單字、作答、正確讀音與結果，最新在前，可直接加入書籤。自訂單字刪除後仍保留歷史快照，停用其書籤按鈕。
- 右上角齒輪提供 JSON 備份匯出／合併匯入與資料來源；不同瀏覽器／裝置的資料不會自動同步。
- 單頁介面固定在視窗內；書籤、自訂單字與答題歷史按可用高度分頁，長內容可開啟詳細視窗並翻頁，不需捲動。所有彈出視窗點擊外側或按 Escape 可關閉。
- 內建題庫在建置時嵌入 HTML，首次載入不另查題庫 API；API 無法連線時仍可依已載入題庫核對答案。

## 本機開發

需要 Node.js 22 或以上。應用與測試沒有 npm 套件相依。

```sh
npm test
npm run build
npm run dev
```

開啟 http://127.0.0.1:8015 。Node 開發伺服器會使用同一個 API handler 模擬 HTTP API。驗證 Cloudflare runtime：

```sh
npx wrangler@4 pages dev dist
```

## 加權抽題演算法

每個單字保存正確次數 c、錯誤次數 m，總作答 n = c + m。平滑錯誤率 p = (m + 1) / (n + 2)，抽題權重 w = 0.25 + 1.75 × p。未答過的字 p = 0.5、w = 1.125；答 10 次錯 8 次 w = 1.5625，錯 2 次 w = 0.6875，前者在同一次抽選時約有後者 2.27 倍的機會。

先篩選所選分類，逐次計算所有剩餘單字的權重總和 W，取均勻隨機數 r ∈ [0, W)，按累積權重找到單字，隨即移出候選池。重複至所選題數或候選池用完。同輪不重複。p 的平滑避免一兩次答題造成極端權重，固定 0.25 底值讓熟悉單字仍有機會出現；權重範圍為 0.25–2（有限次作答不會到達端點）。機率是每次抽選的相對機率，不是整輪固定出現率；若把整個題庫抽完，所有字都會出現一次。

統計獨立於最近 50 題歷史，不因歷史淘汰而減少。舊版資料僅以仍保存的歷史建立初始統計，無法追回更早作答。答案、統計、測驗進度及自動書籤以一次 localStorage 寫入保存；儲存失敗可重試，不能重複計分。儲存完全不可用時仍可在當前分頁暫存內建題庫測驗，但重新整理不保留。

「重練本輪錯題」只抽取該輪錯題（不重複），仍計入單字統計；結算後的「再來一輪」恢復最初所選分類與題數，依更新的統計重新抽題。已刪除自訂字的本輪快照仍可作答與查看，不能新增其書籤。

## REST API

| 方法／資源 | 用途 | 成功狀態 |
| --- | --- | --- |
| `GET /api/words?category=N5&offset=0&limit=100` | 取得內建題庫；category 支援 all／N1–N5 | 200 |
| `GET /api/words/builtin%3A3` | 取得指定內建單字 | 200 |
| `HEAD /api/words`、`HEAD /api/words/:id` | 取得查詢回應 metadata | 200 |
| `POST /api/answer-checks` | 無狀態的答案核對；不建立或保存測驗紀錄 | 200 |

POST JSON：`{"wordId":"builtin:3","answer":"かぞく"}`。

回應為 JSON，成功資料放在 `data`；錯誤放在 `error.code`／`error.message`。錯誤狀態使用 400、404、405（含 Allow）、413、415。查詢可快取；答案核對回應不快取。API 不使用 Cookie session，不以伺服器全域變數保存使用者的目前題目。

自訂單字與書籤的 CRUD 在 `public/core.js` 的 LocalRepository 中，**屬於瀏覽器本機操作，不宣稱它們是 HTTP REST API**。Functions 無法讀取瀏覽器 localStorage，也不保存個人資料。此分工保留無登入及本機保存需求，同時提供真正的 HTTP 題庫／答案 API。

## Cloudflare Pages 部署

### 本機直接上傳

```sh
npx wrangler@4 login
npx wrangler@4 pages project create kanjitest --production-branch=main
npm run deploy
```

`wrangler.toml` 指定輸出目錄 `dist`；Functions 從 repo 根的 `functions/` 編譯。`dist/_routes.json` 只讓 `/api/*` 呼叫 Functions，HTML／JS／CSS 不消耗 Functions 請求額度。預覽版：

```sh
npx wrangler@4 pages deploy dist --project-name=kanjitest --branch=preview
```

### GitHub 整合

若偏好 Cloudflare 自動拉取 GitHub，建立 **Git integration** 類型的 Pages 專案，設定：

- Framework preset：None
- Production branch：main
- Build command：`npm run build`
- Build output directory：`dist`
- Root directory：儲存庫根目錄

Direct Upload 專案不能直接改成 Git integration，應先選定管理方式。GitHub CI 執行測試與建置，不自動發布正式站。

截至 2026-10-05，Cloudflare 官方文件說明靜態資源請求免費且不限次數；Pages Functions 與同帳號 Workers 共用免費方案每日 100,000 次請求。僅 `/api/*` 執行 Functions，本專案無 D1／KV／付費服務相依。

參考：[靜態站部署](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)、[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[Functions 費用](https://developers.cloudflare.com/pages/functions/pricing/)。

## 資料與遷移

- `data/catalog.js` 合併原始 `data/words.js` 與擴充 `data/jlpt-extended.js`；建置時寫入 HTML 的 application/json 區塊，Functions 使用同一份題庫。
- 新增 7,043 筆來自 Tomoshi Dictionary Open Data v2026-09-02，含 JMdict 讀音、繁體中文解釋與社群 JLPT 分級。只保留常規字形及適用讀音、第一義項，並去除與原題庫重複的讀音。原題庫等級保持不變。
- 擴充資料以 CC BY-SA 4.0 分享，完整權利人、修改方式與重建指令見 [data/NOTICE.md](data/NOTICE.md)。JLPT 分級並非官方清單；新增中文翻譯含 AI 輔助產製。
- 網站提供 `/vocabulary-notice.txt` 與 `/jlpt-extended.json`，可查看來源並下載同授權的擴充資料。
- 只抽取原始 SQL 中沒有使用者來源的 N5／N4／N3 單字；原資料庫中的帳號、密碼、自訂單字與個人書籤沒有發布到新版。
- localStorage key：`kanjitest:data:v1`；customWords 使用 `custom:` UUID，bookmarks 保存單字 ID。刪除自訂單字同步移除其書籤。
- 同一版本新增可選的 settings、history、wordStats 與 round 欄位。舊資料預設關閉自動書籤、歷史為空；備份合併去除重複歷史 ID，依時間保留最近 50 題。匯入舊備份不清除現有歷史、設定、累計統計或測驗進度。
- 備份中的累計統計視為快照，每個字的正確／錯誤計數各取最大值，重複匯入不累加；此方式用於還原備份，不代表能精確合併兩個裝置各自新增的所有作答。已有測驗進度時保留現有輪次，否則還原備份中的輪次。
- 每次答案核對成功後，在瀏覽器一次儲存歷史、單字累計統計、本輪結果與自動書籤。儲存失敗不會顯示收藏或計分成功，可重試該題。API 錯誤或已取消的題目不建立歷史。
- 儲存失敗不會把記憶體中的操作誤報成成功；資料損毀時停止覆寫，仍可匯出原始內容供復原。
- 舊 PostgreSQL 資料不會自動移到瀏覽器。若有需要保留的個人資料，需另外匯出並轉為新版 JSON，再用匯入功能載入。
- localStorage 依網站 origin 隔離；預覽網址、正式網址、不同自訂網域之間需透過匯出／匯入轉移。
- `/quiz`、`/bookmarks`、`/words`、`/history` 使用 Pages 的內建 SPA fallback；不將路由 rewrite 到會觸發 canonical redirect 的 `/index.html`。

## 結構

```text
data/catalog.js         合併題庫，供建置與 API 共用
data/words.js           原始公開題庫，保留 ID
data/jlpt-extended.js   CC BY-SA 4.0 擴充題庫
data/NOTICE.md          資料授權與重建來源
public/                前端介面、localStorage repository、路由設定
lib/api.js             無狀態的 HTTP API handler
functions/api/         Cloudflare Pages Functions 路由
tools/build.mjs        安全嵌入題庫並產出 dist
tools/serve.mjs        本機靜態站與 API 開發伺服器
tools/import-tomoshi.py 可重現的 SQLite 題庫篩選工具
tests/                 題庫／儲存／測驗與 API 回歸測試
```
