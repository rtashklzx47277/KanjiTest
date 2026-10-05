import test from 'node:test';
import assert from 'node:assert/strict';
import catalog, { quizWords } from '../data/catalog.js';
import { LocalRepository, isKanaOnly, selectRound } from '../public/core.js';
import { handleApi } from '../lib/api.js';

const storage = () => ({ raw: null, getItem() { return this.raw; }, setItem(key, value) { this.raw = value; } });

test('kana filter handles both scripts, half-width, combining marks, punctuation and long vowels', () => {
  for (const text of ['こんにちは', 'コーヒー', 'コンピューター', 'ﾊﾟﾝ', 'カタかな', '「パン」', '  アイス・クリーム ', 'は\u3099ん']) assert.equal(isKanaOnly(text), true, text);
  for (const text of ['家族', '強いて', '取り扱う', '100メートル', 'Ａ型', 'ABC', 'ー', '']) assert.equal(isKanaOnly(text), false, text);
});

test('active catalog and API exclude kana and duplicate written forms while source IDs stay stable', async () => {
  assert.equal(quizWords.length, 6896);
  assert.equal(catalog.filter(word => isKanaOnly(word.question)).length, 878);
  assert.equal(catalog.length - quizWords.length, 1093);
  assert.deepEqual(Object.fromEntries(['N5','N4','N3','N2','N1'].map(level => [level, quizWords.filter(word => word.category === level).length])), { N5:685, N4:540, N3:1560, N2:1460, N1:2651 });
  assert.ok(quizWords.every(word => !isKanaOnly(word.question)));
  const response = await handleApi(new Request('https://example.test/api/words?limit=1000'));
  const payload = await response.json();
  assert.equal(payload.total, 6896);
  assert.ok(payload.data.every(word => !isKanaOnly(word.question)));
});

test('old kana bookmarks remain readable but all quiz sources and explicit retries exclude kana', () => {
  const saved = storage(), kana = catalog.find(word => isKanaOnly(word.question)), kanji = quizWords[0];
  saved.raw = JSON.stringify({ version: 1, customWords: [], bookmarkIds: [kana.id, kanji.id], settings: { autoBookmarkWrong: true } });
  const repo = new LocalRepository(catalog, saved);
  assert.equal(repo.readOnly, false);
  assert.equal(repo.bookmarks.length, 2);
  assert.equal(repo.getWord(kana.id).question, kana.question);
  assert.deepEqual(repo.wordsIn('bookmark').map(word => word.id), [kanji.id]);
  const custom = repo.addCustom({ question: 'コーヒー', answer: 'こーひー', explanation: '咖啡' });
  assert.equal(repo.customWords.length, 1);
  assert.equal(repo.wordsIn('custom').length, 0);
  assert.ok(repo.wordsIn('all').every(word => !isKanaOnly(word.question)));
  assert.deepEqual(selectRound([kana, custom, kanji], 100), [kanji]);
});

test('early end keeps only real answers and statistics, survives reload and rejects extra grading', () => {
  const saved = storage(), repo = new LocalRepository(catalog, saved);
  repo.startRound('N4', 10);
  const [first, second, third] = repo.state.round.words;
  repo.recordAttempt(first, first.answer.split('/')[0]);
  repo.recordAttempt(second, 'wrong');
  repo.recordAttempt(third, third.answer.split('/')[0]);
  repo.endRound();
  const reloaded = new LocalRepository(catalog, saved), round = reloaded.state.round;
  assert.equal(round.finished, true);
  assert.equal(round.position, 3);
  assert.equal(round.results.length, 3);
  assert.equal(round.results.filter(item => item.correct).length, 2);
  assert.equal('history' in reloaded.state, false);
  assert.equal(Object.values(reloaded.state.wordStats).reduce((n, item) => n + item.correct + item.wrong, 0), 3);
  assert.throws(() => reloaded.recordAttempt(round.words[3], 'wrong'), /已結束/u);
});

test('ending before any answer produces an empty summary without creating attempts', () => {
  const repo = new LocalRepository(catalog, storage());
  repo.startRound('N2', 20);
  repo.endRound();
  assert.equal(repo.state.round.finished, true);
  assert.equal(repo.state.round.results.length, 0);
  assert.deepEqual(repo.state.wordStats, {});
  assert.equal('history' in repo.state, false);
});

test('old pending feedback advances on migration and unanswered kana questions are removed', () => {
  const saved = storage(), repo = new LocalRepository(catalog, saved);
  const kanji = quizWords[0], next = quizWords[1], kana = catalog.find(word => isKanaOnly(word.question));
  const result = repo.recordAttempt(kanji, 'wrong');
  const old = JSON.parse(repo.exportData());
  old.round = { category: 'all', requestedCount: 3, review: false, position: 0, words: [kanji, kana, next], results: [result] };
  old.settings = { autoBookmarkWrong: true };
  saved.raw = JSON.stringify(old);
  const migrated = new LocalRepository(catalog, saved);
  assert.equal(migrated.readOnly, false);
  assert.equal(migrated.state.round.position, 1);
  assert.equal(migrated.state.round.words.length, 2);
  assert.equal(migrated.state.round.words[1].id, next.id);
  assert.equal(migrated.state.round.results[0].wordId, kanji.id);
  migrated.recordAttempt(next, 'wrong');
  assert.equal(migrated.bookmarks.length, 0);
});
