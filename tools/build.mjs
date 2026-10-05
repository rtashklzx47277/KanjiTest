import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import words, { quizWords } from '../data/catalog.js';
import extended from '../data/jlpt-extended.js';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
// Fixed generated directory inside this repository only.
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL('public/', root), dist, { recursive: true });
const template = await readFile(new URL('public/index.html', root), 'utf8');
if (!template.includes('{{BUILTIN_WORDS}}')) throw new Error('Embedded vocabulary placeholder missing');
const embedded = JSON.stringify(words).replace(/</gu, '\\u003c').replace(/\u2028/gu, '\\u2028').replace(/\u2029/gu, '\\u2029');
await writeFile(new URL('index.html', dist), template.replace('{{BUILTIN_WORDS}}', embedded).replace('{{VOCABULARY_COUNT}}', quizWords.length.toLocaleString('en-US')));
await cp(new URL('data/NOTICE.md', root), new URL('vocabulary-notice.txt', dist));
await writeFile(new URL('jlpt-extended.json', dist), JSON.stringify(extended));
console.log(`Built ${fileURLToPath(dist)} with ${quizWords.length} quiz words and ${words.length - quizWords.length} archived source records.`);
