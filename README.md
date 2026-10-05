# KanjiTest｜日文單字測驗

Cloudflare Pages 網頁＋Pages Functions HTTP API。無登入、無 PostgreSQL；自訂單字與書籤保存在瀏覽器的 `localStorage`。

## 功能

- 7,989 個內建單字：N5 852、N4 642、N3 1,790、N2 1,671、N1 3,034；保留原有 946 筆公開題庫與其 ID。
- 分類測驗、答案比對、上一題回顧整合在同一卡片，答題結果以放大文字置中呈現，正確讀音與作答並排比對；讀音接受平假名、片假名與半形片假名。
- 新增／刪除自訂單字、加入／移除書籤、即時搜尋與分類練習。
- 右上角齒輪提供 JSON 備份匯出／合併匯入與資料來源；不同瀏覽器／裝置的資料不會自動同步。
- 單頁介面固定在視窗內；書籤與自訂單字按可用高度分頁，長內容可開啟詳細視窗並翻頁，不需捲動。
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
- 儲存失敗不會把記憶體中的操作誤報成成功；資料損毀時停止覆寫，仍可匯出原始內容供復原。
- 舊 PostgreSQL 資料不會自動移到瀏覽器。若有需要保留的個人資料，需另外匯出並轉為新版 JSON，再用匯入功能載入。
- localStorage 依網站 origin 隔離；預覽網址、正式網址、不同自訂網域之間需透過匯出／匯入轉移。
- `/quiz`、`/bookmarks`、`/words` 使用 Pages 的內建 SPA fallback；不將路由 rewrite 到會觸發 canonical redirect 的 `/index.html`。

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
