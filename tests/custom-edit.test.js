import test from 'node:test';
import assert from 'node:assert/strict';
import words from '../data/catalog.js';
import { LocalRepository } from '../public/core.js';
const storage = () => ({ raw: null, getItem() { return this.raw; }, setItem(key, value) { this.raw = value; } });
const original = { question: '学校', answer: 'がっこう', explanation: '學校' };
const updated = { question: '図書館', answer: 'としょかん', explanation: '圖書館' };

test('custom edits preserve ID, bookmark and counters and survive reload and backup', () => {
  const saved = storage(), repo = new LocalRepository(words, saved);
  const word = repo.addCustom(original);
  repo.addBookmark(word.id); repo.recordAttempt(word, 'wrong');
  const changed = repo.updateCustom(word.id, updated);
  assert.equal(changed.id, word.id);
  assert.equal(repo.customWords.length, 1);
  assert.equal(repo.bookmarks[0].question, updated.question);
  assert.deepEqual(repo.state.wordStats[word.id], { correct: 0, wrong: 1 });
  assert.deepEqual(new LocalRepository(words, saved).getWord(word.id), changed);
  const copy = new LocalRepository(words, storage()); copy.importData(JSON.parse(repo.exportData()));
  assert.deepEqual(copy.getWord(word.id), changed);
  assert.equal(copy.hasBookmark(word.id), true);
});

test('edits update unanswered round words but preserve graded snapshots', () => {
  const repo = new LocalRepository(words, storage());
  const first = repo.addCustom(original), second = repo.addCustom(updated);
  repo.startRound('custom', 2, { words: [first, second], random: () => 0 });
  repo.recordAttempt(first, original.answer);
  repo.updateCustom(first.id, { ...original, explanation: '新的中文解釋' });
  assert.equal(repo.state.round.results[0].explanation, original.explanation);
  assert.equal(repo.state.round.words[0].explanation, original.explanation);
  repo.updateCustom(second.id, { ...updated, answer: 'としょかん/トショカン', explanation: '修改解釋' });
  assert.equal(repo.state.round.words[1].explanation, '修改解釋');
  repo.recordAttempt(repo.state.round.words[1], 'トショカン');
  assert.equal(repo.state.round.results[1].correct, true);
});

test('editing an unanswered word to kana-only removes it from the queue without losing prior results', () => {
  const repo = new LocalRepository(words, storage());
  const first = repo.addCustom(original), second = repo.addCustom(updated);
  repo.startRound('custom', 2, { words: [first, second], random: () => 0 });
  repo.recordAttempt(first, original.answer);
  repo.updateCustom(second.id, { question: 'コーヒー', answer: 'こーひー', explanation: '咖啡' });
  assert.equal(repo.state.round.words.length, 1);
  assert.equal(repo.state.round.position, 1);
  assert.equal(repo.state.round.results[0].correct, true);
  assert.equal(repo.customWords.length, 2);
});

test('invalid and failed edits leave words, bookmarks and queued snapshots unchanged', () => {
  const saved = storage(), repo = new LocalRepository(words, saved);
  const word = repo.addCustom(original); repo.addBookmark(word.id); repo.startRound('custom', 1);
  const before = repo.exportData();
  assert.throws(() => repo.updateCustom('custom:missing', updated));
  assert.throws(() => repo.updateCustom(word.id, { ...updated, answer: ' ' }));
  saved.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  assert.throws(() => repo.updateCustom(word.id, updated));
  assert.equal(repo.exportData(), before);
});
