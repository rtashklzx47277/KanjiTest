import original from './words.js';
import extended from './jlpt-extended.js';
import { isKanaOnly } from '../public/core.js';
const catalog = [...original, ...extended];
// Retain source records for existing bookmarks/history; collections and quizzes use quizWords.
export const quizWords = catalog.filter(word => !isKanaOnly(word.question));
export default catalog;
