import test from 'node:test';
import assert from 'node:assert/strict';
import words from '../data/catalog.js';
import { LocalRepository } from '../public/core.js';

function storage(raw = null) { return { raw, getItem() { return this.raw; }, setItem(key, value) { this.raw = value; } }; }
function attempt(repo, number, answer = 'wrong') {
  return repo.recordAttempt(words[0], answer, { id: `attempt:test-${number}`, answeredAt: new Date(1760000000000 + number * 1000).toISOString() });
}
test('old stored data loads empty history without losing bookmarks', () => {
  const repo = new LocalRepository(words, storage(JSON.stringify({ version: 1, customWords: [], bookmarkIds: [words[0].id] })));
  assert.equal(repo.readOnly, false);
  assert.equal('settings' in repo.state, false);
  assert.deepEqual(repo.history, []);
  assert.equal(repo.hasBookmark(words[0].id), true);
});
test('history retains only the newest 50 attempts and survives a fresh repository', () => {
  const saved = storage(), repo = new LocalRepository(words, saved);
  for (let i = 0; i < 55; i++) attempt(repo, i);
  const reloaded = new LocalRepository(words, saved);
  assert.equal(reloaded.history.length, 50);
  assert.equal(reloaded.history[0].id, 'attempt:test-54');
  assert.equal(reloaded.history[49].id, 'attempt:test-5');
  assert.equal(reloaded.history[0].submitted, 'wrong');
  assert.equal(reloaded.history[0].answer, words[0].answer);
  assert.equal(reloaded.history[0].correct, false);
});
test('removed automatic bookmark option is ignored even when enabled in an old backup', () => {
  const saved = storage(JSON.stringify({ version: 1, customWords: [], bookmarkIds: [words[1].id], settings: { autoBookmarkWrong: true } }));
  const repo = new LocalRepository(words, saved);
  attempt(repo, 1);
  attempt(repo, 2, 'カゾク');
  attempt(repo, 3);
  attempt(repo, 4);
  assert.equal(repo.bookmarks.length, 1);
  assert.equal(repo.hasBookmark(words[0].id), false);
  assert.equal(repo.hasBookmark(words[1].id), true);
  assert.equal('settings' in JSON.parse(repo.exportData()), false);
  assert.equal(new LocalRepository(words, saved).bookmarks.length, 1);
});
test('failed persistence changes neither history nor statistics or existing bookmarks', () => {
  const saved = storage(), repo = new LocalRepository(words, saved);
  repo.addBookmark(words[1].id);
  saved.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  assert.throws(() => attempt(repo, 1), /Full/u);
  assert.equal(repo.history.length, 0);
  assert.equal(repo.bookmarks.length, 1);
  assert.deepEqual(repo.state.wordStats, {});
});
test('backup merges history once and old settings cannot restore removed auto-bookmarks', () => {
  const source = new LocalRepository(words, storage());
  attempt(source, 2);
  const target = new LocalRepository(words, storage());
  attempt(target, 1);
  const backup = JSON.parse(source.exportData());
  backup.settings = { autoBookmarkWrong: true };
  target.importData(backup);
  target.importData(backup);
  assert.equal(target.history.length, 2);
  assert.equal(target.history[0].id, 'attempt:test-2');
  assert.equal('settings' in target.state, false);
  target.importData({ version: 1, customWords: [], bookmarkIds: [] });
  assert.equal('settings' in target.state, false);
  assert.equal(target.history.length, 2);
  backup.history[0].submitted = 'conflict';
  assert.throws(() => target.importData(backup), /衝突/u);
});
test('deleted custom word keeps its historical snapshot while its bookmark is removed', () => {
  const repo = new LocalRepository(words, storage());
  const word = repo.addCustom({ question: '図書館', answer: 'としょかん', explanation: '圖書館' }, 'custom:history');
  repo.addBookmark(word.id);
  repo.recordAttempt(word, 'wrong');
  repo.deleteCustom(word.id);
  assert.equal(repo.history[0].question, '図書館');
  assert.equal(repo.getWord(word.id), undefined);
  assert.equal(repo.hasBookmark(word.id), false);
  const copy = new LocalRepository(words, storage());
  copy.importData(JSON.parse(repo.exportData()));
  assert.equal(copy.history[0].explanation, '圖書館');
});
test('merging two full histories keeps the 50 most recent attempts', () => {
  const source = new LocalRepository(words, storage());
  const target = new LocalRepository(words, storage());
  for (let i = 0; i < 50; i++) attempt(source, i);
  for (let i = 50; i < 100; i++) attempt(target, i);
  target.importData(JSON.parse(source.exportData()));
  assert.equal(target.history.length, 50);
  assert.equal(target.history[0].id, 'attempt:test-99');
  assert.equal(target.history[49].id, 'attempt:test-50');
});
test('malformed and oversized imported histories fail without overwriting existing data', () => {
  const repo = new LocalRepository(words, storage());
  attempt(repo, 1);
  const backup = JSON.parse(repo.exportData());
  for (const patch of [{ correct: 'false' }, { answeredAt: 'invalid' }, { submitted: '' }, { id: {} }, { wordId: 'invalid' }, { category: 'all' }]) {
    assert.throws(() => repo.importData({ ...backup, history: [{ ...backup.history[0], ...patch }] }));
  }
  assert.throws(() => repo.importData({ ...backup, history: Array(51).fill(backup.history[0]) }));
  assert.equal(repo.history.length, 1);
});
