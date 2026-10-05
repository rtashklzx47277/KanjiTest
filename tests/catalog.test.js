import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.js';
import original from '../data/words.js';
import extended from '../data/jlpt-extended.js';
import { LocalRepository, checkAnswer } from '../public/core.js';

test('audited catalog preserves every source ID and supplies valid records at all five levels', () => {
  assert.equal(catalog.length, 7989);
  assert.deepEqual(catalog.map(word => word.id), [...original, ...extended].map(word => word.id));
  assert.equal(new Set(catalog.map(w => w.id)).size, catalog.length);
  assert.deepEqual(new Set(catalog.map(word => word.category)), new Set(['N1','N2','N3','N4','N5']));
  for (const word of catalog) {
    assert.ok(word.question && word.answer && word.explanation);
    assert.ok(word.question.length <= 200 && word.answer.length <= 200 && word.explanation.length <= 1000);
    assert.ok(word.aliasIds.includes(word.id));
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
