import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../lib/api.js';
import words from '../data/words.js';

const request = (path, init) => new Request(`https://example.test${path}`, init);
const post = (payload) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });

test('GET vocabulary collection returns filtered and paginated representations', async () => {
  const response = await handleApi(request('/api/words?category=N4&offset=10&limit=2'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  const payload = await response.json();
  assert.equal(payload.total, 154);
  assert.equal(payload.data.length, 2);
  assert.ok(payload.data.every((word) => word.category === 'N4'));
});
test('GET individual word and HEAD use the same representation metadata', async () => {
  const path = `/api/words/${encodeURIComponent(words[0].id)}`;
  const response = await handleApi(request(path));
  assert.deepEqual((await response.json()).data, words[0]);
  const head = await handleApi(request(path, { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
test('answer checks are stateless across clients and accept katakana readings', async () => {
  const first = await handleApi(request('/api/answer-checks', post({ wordId: words[0].id, answer: 'カゾク' })));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).data.correct, true);
  const other = await handleApi(request('/api/answer-checks', post({ wordId: words[1].id, answer: 'りょうしん' })));
  assert.equal((await other.json()).data.question, words[1].question);
  const wrong = await handleApi(request('/api/answer-checks', post({ wordId: words[0].id, answer: 'まちがい' })));
  assert.equal((await wrong.json()).data.correct, false);
});
test('resource errors preserve HTTP semantics instead of returning HTML or 200 errors', async () => {
  for (const path of ['/api/unknown', '/api/words/builtin:missing']) assert.equal((await handleApi(request(path))).status, 404);
  const wrongMethod = await handleApi(request('/api/words', { method: 'DELETE' }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET, HEAD');
  assert.equal((await handleApi(request('/api/answer-checks'))).status, 405);
  for (const query of ['category=custom', 'limit=-1', 'offset=NaN', 'limit=1001']) assert.equal((await handleApi(request(`/api/words?${query}`))).status, 400);
});
test('malformed JSON, content types, unknown IDs and excessive bodies are rejected', async () => {
  const badJson = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' };
  assert.equal((await handleApi(request('/api/answer-checks', badJson))).status, 400);
  assert.equal((await handleApi(request('/api/answer-checks', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await handleApi(request('/api/answer-checks', post({ wordId: 'missing', answer: 'x' })))).status, 404);
  assert.equal((await handleApi(request('/api/answer-checks', post({ wordId: words[0].id, answer: ' ' })))).status, 400);
  assert.equal((await handleApi(request('/api/answer-checks', post({ wordId: words[0].id, answer: 'a'.repeat(5000) })))).status, 413);
});
