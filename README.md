# KanjiTest｜日文單字測驗

Cloudflare Pages 網頁＋Pages Functions HTTP API。無登入、無 PostgreSQL；自訂單字、書籤、測驗進度、單字累計統計與本輪答題紀錄保存在瀏覽器的 `localStorage`。

完整專案文檔：[文檔入口](docs/README.md)、[架構](docs/architecture.md)、[開發](docs/development.md)、[工具箱與發布](docs/deployment.md)、[資料與題庫](docs/data.md)、[API](docs/api.md)。

Windows 雙擊根目錄 `toolbox.cmd`，或 `npm run toolbox`，開啟本機維護介面。提供驗證、預覽部署、正式部署及提交／推送；部署按鈕都先跑測試與建置。

## 功能

- 6,896 個不同字形的可測驗單字：N5 685、N4 540、N3 1,560、N2 1,460、N1 2,651。排除 878 個純假名來源，另合併 215 筆重複字形。完整 7,989 筆來源 ID 保留供舊書籤與紀錄相容。
- 左上角網站名稱會回到最初的「全部／10 題」開始測驗畫面，清除目前輪次；保留自訂單字、書籤與累計統計。一般測驗導覽及重新整理仍可恢復輪次。
- 全部來源的字形／讀音已依 2026-10-05 官方 JMdict 校驗：7,975 筆辭典直接對應，14 筆為核對詞根的組合詞。保留有效熟字訓、字形與義項限制，接受無上下文題目的多個合法讀法；同字不同讀音有不同意思時分開顯示。中文釋義做來源義項對齊及重點修正，**未完成全部義項的獨立專業語意校對**。詳見 [校驗範圍與結果](data/AUDIT.md)。
- 進入測驗先選難度／題庫、1–100 題，再按開始。輸入超過 100 自動調整為 100。同輪單字不重複；題庫不足時採實際可用題數。依歷次錯誤率加權，較常答錯的單字更容易被抽中。
- 按 Enter 作答後自動切到下一題，同一卡片保留上一題解答；所有寬度都將解答置於題目下方，第一題即預留解答空間，切題時位置不跳動。輸入文字、提示詞、放大的結果與解答直列置中。輸入法選字確認不送出答案，按住 Enter 不重複作答。讀音接受平假名、片假名與半形片假名。測驗中無確認、下一題或收藏按鈕。
- 本輪結算顯示正確率、已答題數與完整紀錄（最多 100 題），可收藏、重練本輪錯題、以原難度／題數再來一輪或重新設定。測驗進度及結算可在重新整理後恢復。
- 本輪結果可勾選「只顯示錯題」，保留原題號並依篩選結果分頁；沒有錯題時顯示提示。切換篩選回到第一頁，正確率、已答總數及錯題重練仍依完整本輪紀錄；新測驗預設顯示全部。
- 可提前結束並結算已答紀錄；正確率只計實際已答題目，未答不算錯。零作答時顯示「正確率 —」，不產生作答紀錄或統計；進行中的答案請求會取消。結算列顯示難度／題庫與已答題數，例如「N5 · 已答 10 題」，三個操作按鈕排列於同列右側，窄螢幕可換行。
- 題目減少短單字下方留白，答對顯示「正解」。操作成功與錯誤提示統一浮動在畫面上方中央，不推擠內容；成功訊息 3 秒、錯誤訊息 5 秒後消失，新訊息會重新計時。編輯視窗內的儲存錯誤使用同樣提示。
- 新增／編輯／刪除自訂單字、加入／移除書籤、即時搜尋與分類練習。編輯保留單字 ID、書籤及累計統計；本輪已答快照不變，尚未作答的題目使用修改後內容。清單移除提示文案及可見搜尋標籤，搜尋框保留無障礙名稱。
- 不再提供答錯自動加入書籤或獨立答題歷史頁；舊設定及歷史不再寫入或匯出。可在本輪結算手動加入書籤。自訂單字刪除後仍保留本輪快照，停用其書籤按鈕。
- 右上角齒輪提供 JSON 備份匯出／合併匯入與資料來源；不同瀏覽器／裝置的資料不會自動同步。
- 單頁介面固定在視窗內；書籤、自訂單字與本輪紀錄按可用高度分頁，長內容可開啟詳細視窗並翻頁，不需捲動。所有彈出視窗點擊外側或按 Escape 可關閉。
- 內建題庫在建置時嵌入 HTML，首次載入不另查題庫 API；API 無法連線時仍可依已載入題庫核對答案。

## 本機開發

需要 Node.js 22 或以上。應用與測試沒有 npm 套件相依。

```sh
npm run verify
npm run dev
```

開啟 http://127.0.0.1:8015 。Node 開發伺服器會使用同一個 API handler 模擬 HTTP API。驗證 Cloudflare runtime：

```sh
npx wrangler@4 pages dev dist
```

## 加權抽題演算法

每個單字保存正確次數 c、錯誤次數 m，總作答 n = c + m。平滑錯誤率 p = (m + 1) / (n + 2)，抽題權重 w = 0.25 + 1.75 × p。未答過的字 p = 0.5、w = 1.125；答 10 次錯 8 次 w = 1.5625，錯 2 次 w = 0.6875，前者在同一次抽選時約有後者 2.27 倍的機會。

先篩選所選分類，依 NFKC 字形合併重複題目。同一內建字形各來源 ID 的正確／錯誤次數相加後計算權重，避免舊 ID 的統計遺失或重複來源增加抽中機會。逐次計算所有剩餘單字的權重總和 W，取均勻隨機數 r ∈ [0, W)，按累積權重找到單字，隨即移出候選池。重複至所選題數或題庫用完。同輪不重複。平滑避免少量作答造成極端權重，0.25 底值讓熟悉單字仍有機會出現；權重範圍為 0.25–2（有限次作答不會到達端點）。機率是每次抽選的相對機率；若把整個題庫抽完，所有字都會出現一次。

累計統計持續保留，移除歷史功能不會清除已累計的次數。舊版若沒有累計統計，僅以仍保存的歷史建立初值，無法追回更早作答；有統計時不重複計入舊歷史。答案、統計、測驗進度與自動切題以一次 localStorage 寫入保存；儲存失敗可重試，不能重複計分。儲存完全不可用時仍可在當前分頁暫存內建題庫測驗，但重新整理不保留。

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
npx --yes wrangler@4 login
npm run deploy:preview
npm run deploy
```

使用現有 Direct Upload 專案 `kanjitest`，不需每次建立新專案。`wrangler.toml` 指定輸出目錄 `dist`；Functions 從 repo 根的 `functions/` 編譯。`dist/_routes.json` 只讓 `/api/*` 呼叫 Functions。工具箱、CLI 及 CI 共用驗證流程，部署前重新測試與建置。

部署設定見 `tools/deployment.json`：Cloudflare 正式標籤為 `main`、預覽為 `preview`；允許的正式 Git 來源為 `main` 與目前遷移分支。其餘分支可部署預覽，不能用工具箱或預設 CLI 發布正式站。Git 提交／推送及 PR 合併不會被部署操作代為執行。

若要從命令列啟動工具箱：

```sh
npm run toolbox
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

- `data/catalog.js` 合併兩份封存來源，套用 `data/vocabulary-audit.js` 校正版，再輸出排除純假名與重複字形的 `quizWords`。建置嵌入所有來源 ID，GET 集合僅回傳可測驗資料，個別 ID 查詢與核對保留相容性。自訂字與舊書籤不自動刪除。
- 7,043 筆擴充來源為 Tomoshi Dictionary Open Data v2026-09-02。校正版使用官方 JMdict 的讀音／字形／義項限制，恢復熟字訓，合併同字合法讀法；每個內建重複字形採既有分級中最容易的等級。分級仍為社群估計，不能據此宣稱每個接受的少見讀法都屬於相同 JLPT 難度。
- 已答紀錄保存原來的快照及判分，不追溯重算統計。尚未作答的內建題目升級為校正版、移除重複字形；重練舊錯題也使用校正版。
- 擴充資料以 CC BY-SA 4.0 分享，完整權利人、修改方式與重建指令見 [data/NOTICE.md](data/NOTICE.md)。JLPT 分級並非官方清單；新增中文翻譯含 AI 輔助產製。
- 網站提供 `/vocabulary-notice.txt` 與 `/jlpt-extended.json`，可查看來源並下載同授權的擴充資料。
- 只抽取原始 SQL 中沒有使用者來源的 N5／N4／N3 單字；原資料庫中的帳號、密碼、自訂單字與個人書籤沒有發布到新版。
- localStorage key：`kanjitest:data:v1`；customWords 使用 `custom:` UUID，bookmarks 保存單字 ID。刪除自訂單字同步移除其書籤。
- 同一版本保留可選的 wordStats 與 round 欄位；舊 settings 忽略，history 僅供一次性建立缺失的累計統計，後續儲存與匯出不包含歷史。匯入舊備份不清除累計統計或測驗進度。舊版等待下一題的輪次改為自動前進，尚未作答的純假名題目移出，已答快照保留。
- 備份中的累計統計視為快照，每個字的正確／錯誤計數各取最大值，重複匯入不累加；此方式用於還原備份，不代表能精確合併兩個裝置各自新增的所有作答。已有測驗進度時保留現有輪次，否則還原備份中的輪次。
- 每次答案核對成功後，在瀏覽器一次儲存單字累計統計、本輪結果與下一題進度。儲存失敗不計分、不切題，可重試該題。API 錯誤或已取消的題目不建立作答紀錄。
- 儲存失敗不會把記憶體中的操作誤報成成功；資料損毀時停止覆寫，仍可匯出原始內容供復原。
- 舊 PostgreSQL 資料不會自動移到瀏覽器。若有需要保留的個人資料，需另外匯出並轉為新版 JSON，再用匯入功能載入。
- localStorage 依網站 origin 隔離；預覽網址、正式網址、不同自訂網域之間需透過匯出／匯入轉移。
- `/quiz`、`/bookmarks`、`/words` 使用 Pages 的內建 SPA fallback；舊 `/history` 網址在前端轉至 `/quiz`。不將路由 rewrite 到會觸發 canonical redirect 的 `/index.html`。

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
tools/workflows.mjs    工具箱與 CLI 共用的驗證／發布流程
tools/toolbox.mjs      本機維護 HTTP 服務
tools/toolbox/         工具箱介面，不部署至公開網站
tools/deployment.json 發布環境與允許 Git 分支
toolbox.cmd            Windows 雙擊啟動器
docs/                  架構、開發、發布、資料與 API 文檔
tools/import-tomoshi.py SQLite 候選題庫篩選工具
tools/audit-vocabulary.py 官方 JMdict 校驗與逐筆 CSV／JSON 報告
data/vocabulary-audit.js 穩定 ID 的校正版覆寫
data/AUDIT.md           校驗範圍、統計與限制
tests/                 題庫／儲存／測驗與 API 回歸測試
```
