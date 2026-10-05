import test from 'node:test';
import assert from 'node:assert/strict';
import words from '../data/catalog.js';
import { LocalRepository, checkAnswer } from '../public/core.js';

const storage = raw => ({ raw: raw ?? null, getItem() { return this.raw; }, setItem(key, value) { this.raw = value; } });
const attempt = (i, correct = false) => ({ id: `attempt:legacy-${i}`, answeredAt: new Date(1760000000000 + i * 1000).toISOString(), category: words[0].category, ...checkAnswer(words[0], correct ? words[0].answer : 'wrong') });

test('legacy history seeds counters once but is no longer saved or exported', () => {
  const saved = storage(JSON.stringify({ version: 1, customWords: [], bookmarkIds: [words[1].id], history: [attempt(1, true), attempt(2)], settings: { autoBookmarkWrong: true } }));
  const repo = new LocalRepository(words, saved);
  assert.equal(repo.readOnly, false);
  assert.deepEqual(repo.state.wordStats[words[0].id], { correct: 1, wrong: 1 });
  assert.equal('history' in repo.state, false);
  assert.equal('settings' in repo.state, false);
  repo.recordAttempt(words[0], 'wrong');
  assert.deepEqual(repo.state.wordStats[words[0].id], { correct: 1, wrong: 2 });
  assert.equal(repo.bookmarks.length, 1);
  assert.equal(repo.hasBookmark(words[0].id), false);
  assert.equal('history' in JSON.parse(saved.raw), false);
  assert.equal('history' in JSON.parse(repo.exportData()), false);
  assert.deepEqual(new LocalRepository(words, saved).state.wordStats[words[0].id], { correct: 1, wrong: 2 });
});

test('existing cumulative counters take priority over legacy 50-question snapshots', () => {
  const saved = storage(JSON.stringify({ version: 1, customWords: [], bookmarkIds: [], history: [attempt(1)], wordStats: { [words[0].id]: { correct: 75, wrong: 15 } } }));
  const repo = new LocalRepository(words, saved);
  assert.deepEqual(repo.state.wordStats[words[0].id], { correct: 75, wrong: 15 });
  repo.recordAttempt(words[0], words[0].answer);
  assert.deepEqual(repo.state.wordStats[words[0].id], { correct: 76, wrong: 15 });
});

test('reimporting legacy history cannot recreate history, automatic bookmarks or inflate counters', () => {
  const repo = new LocalRepository(words, storage());
  const backup = { version: 1, customWords: [], bookmarkIds: [], history: [attempt(1), attempt(2, true)], settings: { autoBookmarkWrong: true } };
  repo.importData(backup); repo.importData(backup);
  assert.deepEqual(repo.state.wordStats[words[0].id], { correct: 1, wrong: 1 });
  assert.equal('history' in repo.state, false);
  assert.equal('settings' in repo.state, false);
  assert.equal(repo.bookmarks.length, 0);
});

test('legacy backup without history or statistics preserves current counters and round', () => {
  const repo = new LocalRepository(words, storage());
  repo.startRound('N5', 10);
  repo.recordAttempt(repo.state.round.words[0], 'wrong');
  const before = repo.exportData();
  repo.importData({ version: 1, customWords: [], bookmarkIds: [] });
  assert.equal(repo.exportData(), before);
});

test('malformed legacy history is rejected without changing current data', () => {
  const repo = new LocalRepository(words, storage());
  repo.addBookmark(words[0].id);
  const before = repo.exportData();
  for (const patch of [{ correct: 'false' }, { answeredAt: 'invalid' }, { submitted: '' }, { wordId: 'invalid' }]) {
    assert.throws(() => repo.importData({ version: 1, customWords: [], bookmarkIds: [], history: [{ ...attempt(1), ...patch }] }));
  }
  assert.throws(() => repo.importData({ version: 1, customWords: [], bookmarkIds: [], history: Array(51).fill(attempt(1)) }));
  assert.equal(repo.exportData(), before);
});
