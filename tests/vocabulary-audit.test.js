import test from 'node:test';
import assert from 'node:assert/strict';
import catalog, { quizWords } from '../data/catalog.js';
import original from '../data/words.js';
import extended from '../data/jlpt-extended.js';
import { LocalRepository, checkAnswer, selectRound } from '../public/core.js';
import { handleApi } from '../lib/api.js';

const byId = new Map(catalog.map(word => [word.id, word]));
const storage = raw => ({ raw: raw ?? null, getItem() { return this.raw; }, setItem(key, value) { this.raw = value; } });

test('jukujikun and valid alternative readings work for every retained duplicate ID and API', async () => {
  for (const [question, readings] of [['果物',['くだもの','かぶつ']], ['言う',['いう','ゆう']], ['良い',['いい','よい']], ['明日',['あした','あす']]]) {
    const group = catalog.filter(word => word.question === question);
    assert.ok(group.length);
    for (const word of group) for (const reading of readings) {
      assert.equal(checkAnswer(word, reading).correct, true, `${word.id} ${reading}`);
      const response = await handleApi(new Request('https://example.test/api/answer-checks', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({wordId:word.id, answer:reading}) }));
      assert.equal((await response.json()).data.correct, true);
    }
  }
});

test('written-form restrictions and obsolete/irregular reading tags prevent incorrect acceptance', () => {
  for (const [id, valid, invalid] of [['jmdict:1005550','しつこい','しつっこい'], ['jmdict:1345020','じょおう','じょうおう'], ['builtin:400','いい','えい']]) {
    assert.equal(checkAnswer(byId.get(id), valid).correct, true);
    assert.equal(checkAnswer(byId.get(id), invalid).correct, false);
  }
});

test('missing characters, missing glosses and misleading Chinese translations are corrected', () => {
  assert.equal(byId.get('builtin:198').question, '着物');
  assert.equal(checkAnswer(byId.get('builtin:198'), 'きもの').correct, true);
  assert.equal(checkAnswer(byId.get('builtin:198'), 'もの').correct, false);
  assert.match(byId.get('builtin:671').explanation, /葡萄/u);
  assert.equal(quizWords.find(word => word.question === '片道').explanation, '單程');
  assert.equal(quizWords.find(word => word.question === '手紙').explanation, '信；書信');
  const living = quizWords.find(word => word.question === '生物');
  assert.match(living.explanation, /せいぶつ：生物/u);
  assert.match(living.explanation, /なまもの：生食/u);
});

test('same visible question never appears twice across levels, bookmarks or explicit retry pools', () => {
  assert.equal(new Set(quizWords.map(word => word.question.normalize('NFKC'))).size, quizWords.length);
  const repository = new LocalRepository(catalog, storage());
  const fruit = catalog.filter(word => word.question === '果物');
  fruit.forEach(word => repository.addBookmark(word.id));
  assert.equal(repository.bookmarks.length, fruit.length); // Legacy IDs still exist.
  assert.equal(repository.wordsIn('bookmark').length, 1);
  assert.equal(selectRound(fruit, 100).length, 1);
  assert.ok(fruit.every(word => word.category === 'N5'));
  assert.equal(selectRound(catalog, 100).length, 100);
});

test('mistakes on old dictionary aliases contribute to the shared question weight', () => {
  const fruit = byId.get('builtin:152'), other = byId.get('builtin:3');
  // With a wrong alias answer weight is 1.4167 versus 1.125. Ticket .5
  // still selects fruit; ignoring the alias would select the second word.
  assert.equal(selectRound([fruit, other], 1, {'jmdict:1193060':{correct:0,wrong:1}}, () => .5)[0].id, fruit.id);
});

test('upgrading a saved round corrects pending answers and removes aliases without rewriting graded history', () => {
  const old = [...original, ...extended];
  const fruit = old.find(word => word.id === 'jmdict:1193060');
  const duplicate = old.find(word => word.id === 'builtin:152');
  const first = old.find(word => word.id === 'builtin:3');
  const result = {id:'attempt:old', wordId:first.id, category:first.category, ...checkAnswer(first,'wrong'), answeredAt:'2026-10-05T10:00:00.000Z'};
  const state = { version:1, customWords:[], bookmarkIds:[fruit.id], wordStats:{[fruit.id]:{correct:0,wrong:1}}, round:{category:'all',requestedCount:3,review:false,position:1,words:[first,fruit,duplicate],results:[result]} };
  const repository = new LocalRepository(catalog, storage(JSON.stringify(state)));
  assert.equal(repository.readOnly, false);
  assert.equal(repository.state.round.words.length, 2);
  assert.equal(repository.state.round.words[1].answer, 'くだもの/かぶつ');
  assert.deepEqual(repository.state.round.results[0], result);
  assert.equal(repository.hasBookmark(fruit.id), true);
  repository.recordAttempt(repository.state.round.words[1], 'くだもの');
  assert.equal(repository.state.round.results[1].correct, true);
  assert.deepEqual(repository.state.wordStats[fruit.id], {correct:1,wrong:1});
  const before = repository.state.wordStats;
  repository.clearRound();
  assert.equal(repository.state.round, null);
  assert.deepEqual(repository.state.wordStats, before);
  assert.equal(repository.bookmarks.length, 1);
});
