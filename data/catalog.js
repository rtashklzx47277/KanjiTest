import original from './words.js';
import extended from './jlpt-extended.js';
import { uniqueQuizWords } from '../public/core.js';
import audited from './vocabulary-audit.js';
const corrected = [...original, ...extended].map(word => ({ ...word, ...audited[word.id] }));
const groups = new Map();
for (const word of corrected) {
  const key = word.question.normalize('NFKC');
  const group = groups.get(key) ?? { level: 0, aliasIds: [] };
  group.level = Math.max(group.level, Number(word.category.slice(1)));
  group.aliasIds.push(word.id);
  groups.set(key, group);
}
// The easiest existing JLPT estimate applies to a shared context-free written form.
const catalog = corrected.map(word => ({ ...word, category: `N${groups.get(word.question.normalize('NFKC')).level}`, aliasIds: groups.get(word.question.normalize('NFKC')).aliasIds }));
// Retain source records for existing bookmarks/history; collections and quizzes use quizWords.
export const quizWords = uniqueQuizWords(catalog);
export default catalog;
