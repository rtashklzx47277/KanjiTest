# Extended vocabulary attribution

`jlpt-extended.js` is a modified subset of [Tomoshi Dictionary Open Data](https://github.com/tomoshi-app/tomoshi-dict-data), release **v2026-09-02**, licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The original dataset's [licensing](https://github.com/tomoshi-app/tomoshi-dict-data/blob/main/LICENSE.md) and [notices](https://github.com/tomoshi-app/tomoshi-dict-data/blob/main/NOTICE.md) apply.

- Japanese headwords and readings: JMdict © Electronic Dictionary Research and Development Group (EDRDG), used in conformance with its [licence](https://www.edrdg.org/edrdg/licence.html); restructuring and derivations © Y1Z.
- Traditional Chinese gloss translations: JMdict-derived content © Y1Z, prepared with LLM assistance. These glosses may contain errors.
- JLPT estimates: Jonathan Waller's JLPT Resources (CC BY), via [stephenmk/yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab) (CC BY-SA 4.0). N1–N5 are community estimates, not an official JLPT vocabulary list.

KanjiTest modifications: select entries with JLPT levels and Traditional Chinese glosses; choose a regular written form and its compatible readings; exclude marked search-only/rare/irregular forms; retain the first Chinese sense; deduplicate against the original vocabulary; assign stable JMdict IDs; restructure as a JavaScript array. The modified extended dataset remains **CC BY-SA 4.0**, with no additional restrictions. This notice concerns the extended dataset; the original `words.js` is preserved separately.

Reproduction with Python 3.14 (no third-party packages):
1. Download `tomoshi-dict-open.db.zst` from the pinned [release](https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-09-02).
2. Verify compressed SHA-256 `7153dfd7a8e42e2d920308370eac90cf9f2e4b4cfe67fb9a86e9aa1c89494073`, then decompress using `compression.zstd`.
3. Run `python tools/import-tomoshi.py path/to/tomoshi-dict-open.db`.

No example sentences, Wiktionary definitions, stroke-order data, logos, or proprietary application data are imported.
