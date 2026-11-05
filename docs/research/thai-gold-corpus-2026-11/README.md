# Thai gold segmentation corpus for G-TH (Q3)

Research date: 5 November 2026. Answers the source and licence part of owner
question Q3 in [the typography plan](../../plans/typography-engine-plan.md#10-open-questions-for-the-owner).
No corpus data was downloaded or committed.

## Method and limits

- Primary sources only: the publisher's own corpus card, page or repository, or
  the authors' paper. Mirrors (SEACrowd, TensorFlow catalogue, awesome lists) are
  named only to explain why a claim stays **unverified**.
- This session's network blocked direct page fetches of `huggingface.co` and
  `arts.chula.ac.th`. Claims marked "(search excerpt)" come from a web-search
  excerpt of the cited primary page, not from a full read. Re-read each page
  before relying on it.

## 1. Candidates

| Corpus                               | Publisher                                      | Size                             | Annotation                                                                                          | Licence                                                                                | Commercial use                     | Excerpts in a public repo                                                     |
| ------------------------------------ | ---------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| LST20                                | NECTEC (LST)                                   | **unverified**                   | Word boundaries, POS, NE, clause and sentence boundaries; words follow the InterBEST 2009 guideline | Free for non-commercial, research and open-source use; paid licence for commercial use | Only with a paid licence           | No: "modification and redistribution … strictly prohibited unless authorized" |
| BEST 2010 (InterBEST 2009 guideline) | NECTEC                                         | **unverified**                   | Word boundaries                                                                                     | **unverified** (CC BY-NC-SA 3.0 on a card whose NECTEC ownership is unconfirmed)       | **unverified**; NC would forbid it | **unverified**; SA plus NC would make excerpts non-commercial too             |
| ORCHID                               | NECTEC with CRL Japan                          | **unverified**                   | Word boundaries and POS                                                                             | **unverified** (mirrors say CC BY-NC-SA 3.0 TH)                                        | **unverified**                     | **unverified**                                                                |
| TNC (Thai National Corpus)           | Chulalongkorn University, Dept. of Linguistics | 14 M words in the 2009 report    | General corpus; segmentation scheme **unverified**                                                  | **unverified**                                                                         | **unverified**                     | **unverified**                                                                |
| VISTEC-TP-TH-21                      | VISTEC (OSKut authors)                         | **unverified** at primary source | Word boundaries, misspelling, NE (per mirror)                                                       | **unverified** at primary source (mirror says CC BY-SA 3.0)                            | Would be allowed under BY-SA       | Would be allowed under BY-SA, with attribution and share-alike                |

Sources and how to obtain:

- **LST20.** Publisher card (search excerpt):
  <https://huggingface.co/datasets/lst-nectec/lst20/blob/main/README.md>. It gives
  the five annotation layers, the InterBEST 2009 word guideline, the
  non-commercial terms, the paid commercial option and the redistribution ban.
  The tarball `AIFORTHAI-LST20Corpus.tar.gz` is downloaded by hand from
  <https://aiforthai.in.th/corpus.php>. Licence questions go to Dr Thepchai
  Supnithi at NECTEC, the contact the card names.
- **BEST 2010.** Card: <https://huggingface.co/datasets/nectec/best2009/blob/main/README.md>
  (search excerpt). It cites the BEST 2010 word-tokenisation competition, the
  InterBEST 2009 guideline and CC BY-NC-SA 3.0, and says the test answers are not
  public. The excerpt does not show that this `nectec` account is NECTEC's own,
  so the licence stays **unverified**. Line counts and the download route are
  also **unverified**.
- **ORCHID.** Origin paper: "Building a Thai part-of-speech tagged corpus
  (ORCHID)", _J. Acoust. Soc. Jpn. (E)_ 20(3):
  <https://www.jstage.jst.go.jp/article/ast1980/20/3/20_3_189/_article>. Every
  licence and size claim found came from mirrors only, so all stay
  **unverified**.
- **TNC.** Authors' progress report (ACL W09-3422):
  <https://aclanthology.org/W09-3422.pdf>. It reports a 14-million-word general
  corpus. Its project page, <https://www.arts.chula.ac.th/ling/tnc3/>, could not
  be read here. Access and licence: **unverified**. Contact the Department of
  Linguistics.
- **VISTEC-TP-TH-21.** Authors' repository: <https://github.com/mrpeerat/OSKut>
  (ACL 2021 Findings, "Handling Cross- and Out-of-Domain Samples in Thai Word
  Segmentation"). Its licence file was not read, so the licence stays
  **unverified**. It is Twitter text, so third-party content rights also apply
  to any excerpt.

## 2. What G-TH needs (from the plan)

From [§2.1 T09/T10](../../plans/typography-engine-plan.md#21-parity-matrix),
[§5 M3](../../plans/typography-engine-plan.md#m3--break-opportunities-and-thai-segmentation-20)
and [§6](../../plans/typography-engine-plan.md#6-test-strategy):

- At least 2,000 annotated boundaries, from a source and under a licence the
  owner approves.
- Line breaking at 5 widths: at least 99 % of chosen breaks fall on
  **gold-acceptable** boundaries, with 0 breaks inside a Thai syllable.
- Thai line edges: ๆ never starts a line. Also covered: ฯ, quotes and `%`.
- Number and unit edges: currency or amount plus unit stays together.
- Probe regressions: กรุงเทพมหานคร, โปรโมชั่นพิเศษ, Static Ads T04.

**Coverage by word-segmentation corpora.** They cover only part of this. They
give word boundaries under a linguistic guideline, not line-break acceptability.
A compound such as กรุงเทพมหานคร may be split into words that a designer would
never break between. The corpora also mark no syllable boundaries, no
"never break here" glue for amount plus unit, and no edge rules for ๆ or ฯ. G-TH
needs a break-acceptability layer added by hand whatever the source, so a
corpus saves only the first-pass word boundaries.

## 3. Recommendation

|                           | Best licensed corpus (LST20)                                                          | Own campaign copy (~300 lines)                               |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Licence risk              | Non-commercial unless paid; redistribution banned, so no fixtures in this public repo | None: the workspace owns the text                            |
| Fit to G-TH               | News-style prose; few prices, units or campaign phrases                               | Exactly the target domain: prices, promos, brand names       |
| Break-acceptability layer | Still has to be annotated                                                             | Annotated in the same pass                                   |
| Cost                      | Licence negotiation plus annotation                                                   | Claude drafts boundaries; a native Thai reader corrects them |
| Reproducibility           | Fixtures stay private, so CI cannot run T10 in the public repo                        | Fixtures committed and run in CI                             |

**Recommended:** annotate the owner's own Thai campaign copy. The public repo
needs committed fixtures, and LST20's terms forbid redistribution. No
verified-permissive corpus exists. VISTEC-TP-TH-21 is the only possibly
permissive one, and it is unverified Twitter text. About 300 lines gives
comfortably more than 2,000 boundaries. LST20 can still serve as an optional
private, non-committed sanity check under its research terms. Confirm that
use with NECTEC first.

Decisions for the owner:

1. Approve own-copy annotation as the G-TH source, and the licence for the
   committed fixtures (for example, the repository's own licence).
2. Name the native Thai reader and the time budget for correction.
3. Approve the annotation scheme: syllable boundaries, acceptable and preferred
   breaks, and must-not-break glue (amount plus unit, ๆ, ฯ, quotes, `%`).
4. Select which campaign copy to use, and confirm it contains nothing that must
   not become public.
5. Decide whether to contact NECTEC about LST20 for private cross-checks.
