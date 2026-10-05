import test from 'node:test';
import assert from 'node:assert/strict';
import words from '../data/catalog.js';
import { LocalRepository, questionWeight, selectRound } from '../public/core.js';

const storage = () => ({ raw: null, getItem() { return this.raw; }, setItem(key, value) { this.raw = value; } });
const repo = () => new LocalRepository(words, storage());

test('smoothed error weights increase with mistakes and retain a minimum chance', () => {
  assert.equal(questionWeight(), 1.125);
  assert.equal(questionWeight({ correct: 8, wrong: 2 }), 0.6875);
  assert.equal(questionWeight({ correct: 2, wrong: 8 }), 1.5625);
  assert.ok(questionWeight({ correct: 1000000, wrong: 0 }) > 0.25);
  assert.ok(questionWeight({ correct: 0, wrong: 1000000 }) < 2);
});

test('weighted first draws match expected probabilities and complete rounds never repeat', () => {
  const pool = words.slice(0, 2), stats = { [pool[0].id]: { correct: 8, wrong: 2 }, [pool[1].id]: { correct: 2, wrong: 8 } };
  let high = 0;
  for (let i = 0; i < 900; i++) if (selectRound(pool, 1, stats, () => (i + 0.5) / 900)[0].id === pool[1].id) high++;
  assert.equal(high, 625); // 1.5625 / (1.5625 + .6875) = 625 / 900.
  const round = selectRound(words, 100, stats, () => 0.999999);
  assert.equal(round.length, 100);
  assert.equal(new Set(round.map(word => word.id)).size, 100);
  assert.equal(selectRound([pool[0], pool[0], pool[1]], 100).length, 2);
  assert.deepEqual(selectRound([], 10), []);
  for (const count of [0, 101, 1.5, NaN, '10']) assert.throws(() => selectRound(pool, count));
});

test('100-question round retains all results while global history keeps 50 and progress reloads', () => {
  const saved = storage();
  let repository = new LocalRepository(words, saved);
  repository.startRound('N5', 100, { random: () => 0 });
  assert.equal(repository.state.round.words.length, 100);
  for (let i = 0; i < 100; i++) {
    const word = repository.state.round.words[i];
    repository.recordAttempt(word, i % 2 ? 'wrong' : word.answer.split(/[/／、,;；]/u)[0]);
    assert.throws(() => repository.recordAttempt(word, 'wrong'), /已完成/u);
    repository = new LocalRepository(words, saved);
    assert.equal(repository.state.round.results.length, i + 1);
    assert.equal(repository.state.round.position, i);
    repository.advanceRound();
  }
  assert.equal(repository.state.round.position, 100);
  assert.equal(repository.state.round.results.length, 100);
  assert.equal(repository.state.round.results.filter(item => item.correct).length, 50);
  assert.equal(repository.history.length, 50);
  assert.equal(Object.values(repository.state.wordStats).reduce((n, item) => n + item.correct + item.wrong, 0), 100);
  assert.throws(() => repository.advanceRound());
});

test('retry uses only incorrect words and keeps original selected count for another normal round', () => {
  const repository = repo();
  repository.startRound('N4', 10, { random: () => 0 });
  for (const [index, word] of repository.state.round.words.entries()) {
    repository.recordAttempt(word, index < 3 ? 'wrong' : word.answer.split(/[/／、,;；]/u)[0]);
    repository.advanceRound();
  }
  const previous = repository.state.round;
  const wrong = previous.words.filter(word => previous.results.some(item => item.wordId === word.id && !item.correct));
  repository.startRound(previous.category, previous.requestedCount, { words: wrong, review: true });
  assert.equal(repository.state.round.words.length, 3);
  assert.equal(repository.state.round.requestedCount, 10);
  assert.equal(repository.state.round.review, true);
  assert.deepEqual(new Set(repository.state.round.words.map(word => word.id)), new Set(wrong.map(word => word.id)));
});

test('per-word totals survive history rollover and migrate only available old history', () => {
  const repository = repo();
  for (let i = 0; i < 65; i++) repository.recordAttempt(words[0], i < 15 ? 'wrong' : words[0].answer);
  assert.deepEqual(repository.state.wordStats[words[0].id], { correct: 50, wrong: 15 });
  const legacy = JSON.parse(repository.exportData());
  delete legacy.wordStats;
  const oldStorage = storage(); oldStorage.raw = JSON.stringify(legacy);
  const migrated = new LocalRepository(words, oldStorage);
  assert.deepEqual(migrated.state.wordStats[words[0].id], { correct: 50, wrong: 0 });
  const restored = repo();
  restored.importData(JSON.parse(repository.exportData()));
  restored.importData(JSON.parse(repository.exportData()));
  assert.deepEqual(restored.state.wordStats[words[0].id], { correct: 50, wrong: 15 });
});

test('failed storage cannot partially count an answer, add a bookmark, or advance a round', () => {
  const saved = storage(), repository = new LocalRepository(words, saved);
  repository.setAutoBookmarkWrong(true);
  repository.startRound('N5', 1);
  const before = repository.exportData();
  saved.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  assert.throws(() => repository.recordAttempt(repository.state.round.words[0], 'wrong'));
  assert.equal(repository.exportData(), before);
});

test('deleted custom words keep round snapshots and cannot create dangling auto-bookmarks', () => {
  const repository = repo();
  const word = repository.addCustom({ question: '図書館', answer: 'としょかん', explanation: '圖書館' });
  repository.startRound('custom', 100);
  repository.deleteCustom(word.id);
  repository.setAutoBookmarkWrong(true);
  repository.recordAttempt(repository.state.round.words[0], 'wrong');
  repository.advanceRound();
  assert.equal(repository.bookmarks.length, 0);
  assert.equal(repository.state.round.results[0].question, '図書館');
});

test('corrupt imported rounds and statistics reject without changing existing data', () => {
  const repository = repo();
  repository.startRound('N1', 10);
  const backup = JSON.parse(repository.exportData());
  for (const patch of [{ position: 2 }, { requestedCount: 101 }, { words: [backup.round.words[0], backup.round.words[0]] }, { results: [{}] }]) {
    assert.throws(() => repository.importData({ ...backup, round: { ...backup.round, ...patch } }));
  }
  for (const stats of [{ [words[0].id]: { correct: -1, wrong: 1 } }, { [words[0].id]: { correct: 1, wrong: '2' } }, { invalid: { correct: 0, wrong: 0 } }]) {
    assert.throws(() => repository.importData({ ...backup, wordStats: stats }));
  }
  assert.equal(repository.exportData(), JSON.stringify(backup, null, 2));
});
