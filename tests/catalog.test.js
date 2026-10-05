import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.js';
import original from '../data/words.js';
import extended from '../data/jlpt-extended.js';
import { LocalRepository, checkAnswer } from '../public/core.js';

test('expanded catalog preserves every original record and supplies all five levels', () => {
  assert.equal(catalog.length, 7989);
  assert.deepEqual(catalog.slice(0, original.length), original);
  assert.equal(new Set(catalog.map(w => w.id)).size, catalog.length);
  assert.deepEqual(Object.fromEntries(['N5','N4','N3','N2','N1'].map(level => [level, catalog.filter(w => w.category === level).length])), { N5:852, N4:642, N3:1790, N2:1671, N1:3034 });
  for (const word of extended) {
    assert.match(word.id, /^jmdict:\d+$/u);
    assert.ok(word.question && word.answer && word.explanation);
    for (const reading of word.answer.split('/')) assert.equal(checkAnswer(word, reading).correct, true);
  }
});
test('old backups load in expanded catalog and new IDs survive export/import', () => {
  const state = { version:1, customWords:[], bookmarkIds:['builtin:3'] };
  const storage = { getItem: () => JSON.stringify(state), setItem() {} };
  const repo = new LocalRepository(catalog, storage);
  assert.equal(repo.readOnly, false);
  const word = extended.find(w => w.category === 'N1');
  repo.addBookmark(word.id);
  const target = new LocalRepository(catalog, { getItem:() => null, setItem() {} });
  target.importData(JSON.parse(repo.exportData()));
  assert.equal(target.bookmarks.length, 2);
  assert.equal(target.hasBookmark(word.id), true);
});
