"""Extract the licensed JLPT/Traditional Chinese subset from the pinned SQLite release.
Usage: python tools/import-tomoshi.py path/to/tomoshi-dict-open.db
Download and compressed checksum are documented in data/NOTICE.md.
"""
import collections
import json
import pathlib
import sqlite3
import sys
import unicodedata

root = pathlib.Path(__file__).resolve().parents[1]
original = json.loads((root / 'data/words.js').read_text(encoding='utf-8').split('export default ', 1)[1].rstrip(';\n'))
def normalize(text):
    return ''.join(chr(ord(c)-0x60) if '\u30a1' <= c <= '\u30f6' else c for c in unicodedata.normalize('NFKC', text))
seen = {(normalize(w['question']), normalize(a)) for w in original for a in w['answer'].split('/')}
connection = sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri() + '?mode=ro', uri=True)
for table in ['entries', 'vocab_jlpt', 'zh_defs_zhtw']:
    assert connection.execute('SELECT license FROM table_licenses WHERE table_name=?', (table,)).fetchone()[0] == 'CC-BY-SA-4.0'
words = []
query = '''SELECT e.id,v.level,e.data,z.data FROM entries e
JOIN vocab_jlpt v ON e.id=v.entry_id JOIN zh_defs_zhtw z ON e.id=z.entry_id
WHERE z.locale='zh-TW' ORDER BY CAST(e.id AS INTEGER)'''
for entry_id, level, raw, zh_raw in connection.execute(query):
    entry, zh = json.loads(raw), json.loads(zh_raw)
    # Ignore search-only, obsolete, irregular and rare forms in reading quizzes.
    kanji = [f for f in entry['kanji'] if not f['info']]
    kana = [f for f in entry['kana'] if not f['info']]
    if not kana:
        continue
    form = next((f for f in kanji if f['priority']), kanji[0] if kanji else None)
    question = form['text'] if form else kana[0]['text']
    readings = list(dict.fromkeys(f['text'] for f in kana if not f['restricted_to'] or question in f['restricted_to']))
    readings = [r for r in readings if (normalize(question), normalize(r)) not in seen]
    if not readings:
        continue
    # A concise first sense makes the reading exercise useful without hiding a long dictionary entry.
    first = next(iter(zh.get('senses', {}).values()), {})
    explanation = '；'.join(dict.fromkeys(g['text'] for g in first.get('glosses', []) if g.get('text')))
    if not explanation or len(question) > 200 or len('/'.join(readings)) > 200:
        continue
    words.append(dict(id=f'jmdict:{entry_id}', category=level, question=question, answer='/'.join(readings), explanation=explanation))
    seen.update((normalize(question), normalize(r)) for r in readings)
(root / 'data/jlpt-extended.js').write_text('// CC BY-SA 4.0. Attribution and modifications: ./NOTICE.md\nexport default ' + json.dumps(words, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
print('Added:', len(words), dict(collections.Counter(w['category'] for w in words)))
print('Combined:', len(original) + len(words), dict(collections.Counter(w['category'] for w in original + words)))
