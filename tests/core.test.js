import test from 'node:test';
import assert from 'node:assert/strict';
import words from '../data/words.js';
import { STORAGE_KEY, LocalRepository, checkAnswer, selectQuestion } from '../public/core.js';

function memoryStorage(raw = null) {
  return { raw, getItem() { return this.raw; }, setItem(key, value) { assert.equal(key, STORAGE_KEY); this.raw = value; } };
}
const fields = { question: '図書館', answer: 'としょかん', explanation: '圖書館' };

test('946 public built-ins preserve IDs and the three original levels', () => {
  assert.equal(words.length, 946);
  assert.equal(new Set(words.map((word) => word.id)).size, 946);
  assert.deepEqual(Object.fromEntries(['N5', 'N4', 'N3'].map((level) => [level, words.filter((word) => word.category === level).length])), { N5: 557, N4: 154, N3: 235 });
  assert.ok(words.every((word) => word.id.startsWith('builtin:') && word.question && word.answer && typeof word.explanation === 'string'));
  // The original 葡萄 record has no explanation; preserve the source faithfully.
  assert.equal(words.find((word) => word.id === 'builtin:671').explanation, '');
});
test('kana normalization accepts hiragana, katakana and half-width katakana', () => {
  const word = { id: 'x', ...fields };
  for (const answer of ['としょかん', ' トショカン ', 'ﾄｼｮｶﾝ']) assert.equal(checkAnswer(word, answer).correct, true);
  assert.equal(checkAnswer(word, 'がっこう').correct, false);
  assert.throws(() => checkAnswer(word, ' '));
});
test('empty pools are safe, a one-word pool stays usable and larger pools avoid immediate repetition', () => {
  assert.equal(selectQuestion([], null), null);
  assert.equal(selectQuestion([words[0]], words[0].id), words[0]);
  for (const random of [0, 0.5, 0.999]) assert.notEqual(selectQuestion(words.slice(0, 5), words[0].id, () => random).id, words[0].id);
});
test('custom word and bookmark survive a fresh repository instance', () => {
  const storage = memoryStorage();
  const repo = new LocalRepository(words, storage);
  const word = repo.addCustom(fields, 'custom:test-1');
  repo.addBookmark(word.id);
  repo.addBookmark(words[0].id);
  const reloaded = new LocalRepository(words, storage);
  assert.equal(reloaded.customWords[0].question, fields.question);
  assert.equal(reloaded.bookmarks.length, 2);
  assert.equal(reloaded.wordsIn('custom').length, 1);
  assert.equal(reloaded.wordsIn('all').length, 947);
});
test('bookmark additions deduplicate and deleting a custom word removes its bookmark', () => {
  const repo = new LocalRepository(words, memoryStorage());
  const word = repo.addCustom(fields, 'custom:test-2');
  assert.equal(repo.addBookmark(word.id), true);
  assert.equal(repo.addBookmark(word.id), false);
  repo.deleteCustom(word.id);
  assert.equal(repo.customWords.length, 0);
  assert.equal(repo.bookmarks.length, 0);
});
test('failed persistence does not change in-memory custom words or bookmarks', () => {
  const storage = memoryStorage();
  storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  const repo = new LocalRepository(words, storage);
  assert.throws(() => repo.addCustom(fields, 'custom:test-3'), /Full/u);
  assert.throws(() => repo.addBookmark(words[0].id), /Full/u);
  assert.equal(repo.customWords.length, 0);
  assert.equal(repo.bookmarks.length, 0);
});
test('corrupt stored data is preserved and exportable instead of overwritten', () => {
  const storage = memoryStorage('{invalid');
  const repo = new LocalRepository(words, storage);
  assert.equal(repo.readOnly, true);
  assert.throws(() => repo.addCustom(fields, 'custom:test-4'));
  assert.equal(storage.raw, '{invalid');
  assert.equal(repo.exportData(), '{invalid');
});
test('backup import merges without losing existing words; conflict and dangling IDs are rejected', () => {
  const repo = new LocalRepository(words, memoryStorage());
  repo.addCustom(fields, 'custom:existing');
  repo.addBookmark(words[0].id);
  const source = new LocalRepository(words, memoryStorage());
  source.addCustom({ ...fields, question: '学校' }, 'custom:incoming');
  source.addBookmark('custom:incoming');
  repo.importData(JSON.parse(source.exportData()));
  assert.equal(repo.customWords.length, 2);
  assert.equal(repo.bookmarks.length, 2);
  assert.throws(() => repo.importData({ version: 1, customWords: [], bookmarkIds: ['missing'] }));
  assert.throws(() => repo.importData({ version: 1, customWords: [{ id: 'custom:existing', ...fields, question: '衝突' }], bookmarkIds: [] }));
  assert.equal(repo.customWords.length, 2);
});
test('blank custom fields and duplicate or malformed IDs are rejected', () => {
  const repo = new LocalRepository(words, memoryStorage());
  assert.throws(() => repo.addCustom({ ...fields, answer: ' ' }, 'custom:blank'));
  assert.throws(() => repo.addCustom(fields, words[0].id));
  repo.addCustom(fields, 'custom:duplicate');
  assert.throws(() => repo.addCustom(fields, 'custom:duplicate'));
});
