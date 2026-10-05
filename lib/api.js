import words, { quizWords } from '../data/catalog.js';
import { checkAnswer } from '../public/core.js';

const byId = new Map(words.map((word) => [word.id, word]));
const headers = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' };
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, 'cache-control': 'no-store', ...extra } });
const error = (status, code, message, extra) => json({ error: { code, message } }, status, extra);
const methodError = (allow) => error(405, 'method_not_allowed', '不支援此 HTTP 方法。', { allow });

// Stateless REST resources. Browser-private custom words/bookmarks stay in localStorage.
export async function handleApi(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/u, '');
  const method = request.method;
  if (path === '/api/words' || path.startsWith('/api/words/')) {
    if (!['GET', 'HEAD'].includes(method)) return methodError('GET, HEAD');
    let response;
    if (path === '/api/words') {
      const category = url.searchParams.get('category') || 'all';
      if (!['all', 'N5', 'N4', 'N3', 'N2', 'N1'].includes(category)) return error(400, 'invalid_category', '題庫分類必須為 all 或 N1–N5。');
      const offsetText = url.searchParams.get('offset') || '0';
      const limitText = url.searchParams.get('limit') || '100';
      if (!/^\d+$/u.test(offsetText) || !/^\d+$/u.test(limitText)) return error(400, 'invalid_pagination', '分頁參數必須為整數。');
      const offset = Number(offsetText), limit = Number(limitText);
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) return error(400, 'invalid_pagination', 'limit 範圍為 1–1000，offset 須為非負整數。');
      const filtered = category === 'all' ? quizWords : quizWords.filter((word) => word.category === category);
      response = json({ data: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit }, 200, { 'cache-control': 'public, max-age=300' });
    } else {
      let id;
      try { id = decodeURIComponent(path.slice('/api/words/'.length)); } catch { return error(400, 'invalid_id', '單字 ID 格式不正確。'); }
      const word = byId.get(id);
      if (!word) return error(404, 'word_not_found', '找不到這個內建單字。');
      response = json({ data: word }, 200, { 'cache-control': 'public, max-age=300' });
    }
    return method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }
  if (path === '/api/answer-checks') {
    if (method !== 'POST') return methodError('POST');
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return error(415, 'unsupported_media_type', '請使用 application/json。');
    // Reject oversize bodies while streaming rather than trusting Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return error(400, 'invalid_json', '缺少 JSON 內容。');
    let size = 0;
    const chunks = [];
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) { await reader.cancel(); return error(413, 'body_too_large', '請求內容過大。'); }
        chunks.push(value);
      }
    } catch { return error(400, 'invalid_body', '無法讀取請求。'); }
    const bytes = new Uint8Array(size);
    let start = 0;
    for (const chunk of chunks) { bytes.set(chunk, start); start += chunk.length; }
    let input;
    try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return error(400, 'invalid_json', 'JSON 格式不正確。'); }
    if (!input || typeof input.wordId !== 'string' || typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 200) return error(400, 'invalid_answer', '請提供 wordId 與 1–200 字的 answer。');
    const word = byId.get(input.wordId);
    if (!word) return error(404, 'word_not_found', '找不到這個內建單字。');
    // An answer check is a computation, not a persisted attempt/session.
    return json({ data: checkAnswer(word, input.answer) });
  }
  return error(404, 'resource_not_found', '找不到此 API 資源。');
}
