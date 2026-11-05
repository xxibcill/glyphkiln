# ICU data

`78.3/thaidict.txt` is ICU's Thai word list, used by the hybrid Thai segmenter
(`thai-segmentation-hybrid@1.0.0`). It was checked on 5 November 2026.

| Field   | Value                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| Source  | <https://raw.githubusercontent.com/unicode-org/icu/release-78.3/icu4c/source/data/brkitr/dictionaries/thaidict.txt> |
| Tag     | `release-78.3` (commit `21d1eb0f306e1141c10931e914dfc038c06121da`)                                                  |
| SHA-256 | `3166abde40c0f44ab91c28f5ce96d7d1472cb7882e1c0bda0a72f8f69dba4274`                                                  |
| Words   | 26,383 (11 comment lines)                                                                                           |
| Licence | Unicode License v3 (`Unicode-3.0`)                                                                                  |

**Licence evidence.**

- The file's header reads `Copyright (C) 2016 and later: Unicode, Inc. and
others.` and `License & terms of use: http://www.unicode.org/copyright.html`,
  followed by `Copyright (c) 2006-2015 International Business Machines
Corporation, Apple Inc., and others. All Rights Reserved.`
- ICU's top-level [`LICENSE`](LICENSE) at the same tag (SHA-256
  `e55522d81edc687a341a4411e0776e54ca654e90147f354a90458aaced4116af`) is the
  Unicode License v3. Its "Third-Party Software Licenses" section lists: the old ICU licence (ICU
  1.8.1 to 57.1); the Chinese/Japanese (`cjdict.txt`), Lao (`laodict.txt`) and
  Burmese (`burmesedict.txt`) dictionaries; the time zone database; Google
  double-conversion; nlohmann `json.hpp`; the ICU4C build files `aclocal.m4`
  and `config.guess` (GPL with the Autoconf exception) and `install-sh`; and
  ICU4J's `sorttable.js`. It has **no entry for the Thai dictionary**, so
  `thaidict.txt` carries no third-party terms. The GPL entries cover build
  scripts only, which we do not use.
- The 2006–2015 IBM and Apple notice predates ICU's move to Unicode, Inc. ICU's
  `LICENSE` covers that period with the old ICU licence, an MIT-style
  permissive licence. We keep the notice with the data.
- No LGPL, GPL or non-commercial terms apply. libthai and the PyThaiNLP corpora
  were not used.

`generate-thai-dictionary-data.mjs` checks the hash and writes
`src/typography/thai-dictionary.generated.ts`; `npm run text-layout-data:verify`
fails when that module is stale.
