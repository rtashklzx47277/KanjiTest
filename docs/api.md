# HTTP API

API 為公開無狀態題庫查詢及答案核對，不保存使用者目前題目、作答、書籤或自訂字。根目錄 `functions/api/[[path]].js` 呼叫 `lib/api.js`；本機開發伺服器使用同一 handler。

成功回應使用 `data`，錯誤使用 `error.code`／`error.message`；`Content-Type` 為 `application/json; charset=utf-8`，含 `X-Content-Type-Options: nosniff`。

## 題庫集合

```http
GET /api/words?category=N5&offset=0&limit=100
```

| 參數 | 預設 | 限制 |
| --- | --- | --- |
| `category` | all | all、N1–N5；書籤／自訂題庫由瀏覽器處理 |
| `offset` | 0 | 非負安全整數 |
| `limit` | 100 | 1–1000 的整數 |

回應包含 `data` 陣列、`total`、`offset`、`limit`。僅列可測驗且已去重的字形，全部共 6,896 題；每個單字包含 `id`、`category`、`question`、`answer`、`explanation`、`quizEligible`、`aliasIds`。

## 指定單字

```http
GET /api/words/builtin%3A3
```

`data` 為單一校正版單字。保留來源 ID 查詢，因此可以取得未獨立抽選的純假名或重複來源，供舊書籤／備份相容。

上述兩個 GET 都支援 HEAD，回應相同 metadata、不含內容。成功查詢快取標頭為 `public, max-age=300`。

## 答案核對

```http
POST /api/answer-checks
Content-Type: application/json

{"wordId":"builtin:3","answer":"かぞく"}
```

```json
{
  "data": {
    "wordId": "builtin:3",
    "question": "家族",
    "answer": "かぞく",
    "explanation": "家人",
    "submitted": "かぞく",
    "correct": true
  }
}
```

答案須為非空字串，最多 200 字。讀音接受平假名、片假名、半形片假名與前後空白。多個合法讀音由校正版資料提供。錯誤答案也是正常計算結果，回應 200 且 `correct:false`；不以錯誤 HTTP 狀態表示答錯。

API 請求內容以串流計算，超過 4096 bytes 拒絕；不只相信 Content-Length。核對回應為 `no-store`，不產生 attempt ID、時間戳、Cookie 或累計計分。

前端成功核對後由 LocalRepository 使用相同規則保存結果與進度；自訂字及 API 斷線／逾時時在瀏覽器核對。

## 錯誤狀態

| 狀態 | 例子 |
| --- | --- |
| 400 | JSON、答案、分類、分頁、URL ID 格式不正確 |
| 404 | 單字 ID 或 API 資源不存在 |
| 405 | 方法不支援，附 `Allow` 標頭 |
| 413 | 核對請求超過 4096 bytes |
| 415 | 核對未使用 application/json |

例如：

```json
{"error":{"code":"word_not_found","message":"找不到這個內建單字。"}}
```

自訂字新增／編輯／刪除與書籤操作位於瀏覽器，沒有對應的 HTTP CRUD 端點。工具箱的本機 `/api/run` 是維護介面，與網站 API 分開，不會公開部署。
