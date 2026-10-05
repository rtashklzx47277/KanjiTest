# Extended vocabulary attribution

`jlpt-extended.js` is a modified subset of [Tomoshi Dictionary Open Data](https://github.com/tomoshi-app/tomoshi-dict-data), release **v2026-09-02**, licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The original dataset's [licensing](https://github.com/tomoshi-app/tomoshi-dict-data/blob/main/LICENSE.md) and [notices](https://github.com/tomoshi-app/tomoshi-dict-data/blob/main/NOTICE.md) apply.

- Japanese headwords and readings: JMdict © Electronic Dictionary Research and Development Group (EDRDG), used in conformance with its [licence](https://www.edrdg.org/edrdg/licence.html); restructuring and derivations © Y1Z.
- Traditional Chinese gloss translations: JMdict-derived content © Y1Z, prepared with LLM assistance. These glosses may contain errors.
- JLPT estimates: Jonathan Waller's JLPT Resources (CC BY), via [stephenmk/yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab) (CC BY-SA 4.0). N1–N5 are community estimates, not an official JLPT vocabulary list.

Archived `jlpt-extended.js` records the first imported subset with stable JMdict IDs. Its original filtering incorrectly removed normal jukujikun and split some shared written forms into incomplete reading sets. It is retained for provenance and saved-ID compatibility, not used without corrections.

The live `catalog.js` applies `vocabulary-audit.js`, derived from official JMdict XML created **2026-10-05** (© EDRDG, CC BY-SA 4.0). It respects written-form/reading/sense restrictions, restores normal jukujikun, accepts compatible modern reading variants, deduplicates quiz written forms, and aligns Chinese glosses to the corresponding senses in the pinned translation source. Assistant-reviewed translation corrections are in `chinese-corrections.json` and `chinese-sense-corrections.json`. Different reading meanings are labelled separately. All original source IDs remain available, and duplicate forms use the easiest existing community JLPT estimate. See [AUDIT.md](AUDIT.md) for exact scope and limitations. These modified/derived vocabulary files and the downloadable corrected extended dataset remain **CC BY-SA 4.0**, with no additional restrictions. The original `words.js` is preserved separately.

Reproduction with Python 3.14 (no third-party packages):
1. Download `tomoshi-dict-open.db.zst` from the pinned [release](https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-09-02).
2. Verify compressed SHA-256 `7153dfd7a8e42e2d920308370eac90cf9f2e4b4cfe67fb9a86e9aa1c89494073`, then decompress using `compression.zstd`.
3. Keep the two archived source arrays in this repository. Download and retain the official XML version/checksum listed in `AUDIT.md`.
4. Run `python tools/audit-vocabulary.py JMdict_e.gz path/to/tomoshi-dict-open.db audit-output` to reproduce the corrected live overrides and per-record report.

For future candidate imports, use `python tools/import-tomoshi.py path/to/tomoshi-dict-open.db candidates.js`, then audit against official XML before adding records. The corrected importer intentionally does not reproduce the historic faulty filter and cannot overwrite the stable-ID archive.

No example sentences, Wiktionary definitions, stroke-order data, logos, or proprietary application data are imported.

The playable catalog excludes kana-only headwords (including punctuation, long vowels and half-width kana) and merges identical written forms. The full source arrays remain available for provenance and saved-ID compatibility. The downloadable extended data contains corrected representations of every extended source ID; excluded/duplicate headwords are not independently sampled in quizzes or listed in API collection queries.
