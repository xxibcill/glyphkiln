# Blind benchmark protocol and scoring sheet

[All briefs](README.md) · [Improvement plan §2](../../../../docs/plans/design-quality-improvement-plan.md)

**Status: proposed protocol, not yet run.** It turns "Glyphkiln beats an
expert designer" into four separately reported measurements. No single number
combines them.

## Entrants

- **Glyphkiln:** the current Core/App output for each brief, produced by the
  repository at a recorded commit, with the authoring time recorded.
- **Expert baseline:** two or three professional graphic designers, each
  producing every brief they accept from the same copy, assets, sizes, and
  time box, in their usual tools. Record their hours and seniority. They see
  the brief only, not the Glyphkiln output.
- Fonts, photographs, and marks are identical for all entrants. An entrant
  that uses an input not in the brief is disqualified for that brief.

## 1. Mandatory-defect gate (per entry)

Before judging, a checker who is not a judge inspects every entry at the
brief's delivery view against its _Mandatory defects_ list.

| Entry | Brief | Defect # (from brief) | Region / evidence | Pass/Fail |
| ----- | ----- | --------------------- | ----------------- | --------- |
|       |       |                       |                   |           |

Report **defect count per entrant per brief**. Entries with any mandatory
defect are still judged, but their preference results are reported separately
and they cannot count as a "win".

## 2. Blind pairwise preference (designer panel)

- **Judges:** at least five working graphic designers who did not produce any
  entry. Record years of practice and specialty; do not disclose which entry
  is Glyphkiln's.
- **Presentation:** each pair is shown side by side at the brief's delivery
  view (for example 360 px wide on a phone or a phone-sized frame), then at
  master size. Left/right position is randomized with a recorded seed; pair
  order is randomized per judge. File names, metadata, and render artifacts
  that could identify the source are removed. Multi-format and sequence briefs
  (K5, K6, C, E) are shown as the full set.
- **Questions per pair**, answered A, B, or "no meaningful difference":

| Dimension             | Question to the judge                                               |
| --------------------- | ------------------------------------------------------------------- |
| Concept / message fit | Which better makes the brief's message specific to this subject?    |
| Composition           | Which organizes attention and space better for this message?        |
| Typography            | Which uses type more expressively and legibly at the delivery size? |
| Imagery               | Which uses the supplied imagery or illustration more effectively?   |
| Color                 | Which uses color more purposefully?                                 |
| Coherence             | (Sets only) Which set works better as a family or sequence?         |
| Finish                | Which is more precisely finished?                                   |
| **Overall**           | Which would you choose to publish for this brief?                   |

- Judges may add one sentence of reasoning per pair. Collect it verbatim; it
  is evidence for later repairs, not a score.

**Report:** for each brief and dimension, Glyphkiln's share of non-tie votes
with a 95% Wilson interval, the tie count, and judge count. "Beats the expert"
for a brief requires overall preference ≥ 50% with zero Glyphkiln mandatory
defects. Report each brief separately before any aggregate.

## 3. Viewer comprehension (target viewers)

- **Participants:** at least 20 people from the brief's audience, none of whom
  are designers on the panel. Each sees one entrant's version of a brief only
  (between-subjects), at delivery size, for a fixed exposure: 3 s for single
  graphics, self-paced for sequences.
- **Question:** the brief's _Comprehension question_, answered in free text and
  coded correct/incorrect by a coder blind to the entrant, using the stated
  correct answer.
- **Report:** proportion correct per entrant per brief with a 95% interval.
  Glyphkiln meets the target when its proportion is not lower than the expert
  baseline's by more than the interval overlap allows; report the raw numbers,
  not only the verdict.

Comprehension and preference are different evidence; neither stands in for
the other. Neither is a commercial result.

## 4. Speed and consistency (Glyphkiln's expected advantage)

| Measure                            | How to record                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Time to first acceptable direction | Wall-clock from brief to the first entry with zero mandatory defects                                                            |
| Revision cost                      | Time to apply one fixed client revision (supplied after round 1 for K1 and K5: a longer headline and a new aspect ratio)        |
| Family consistency                 | For K5 and K6, judges' coherence preference plus a count of unintended differences in type, color, and alignment across the set |

## Round record

Store each round under `Deliverables/benchmarks/<round-id>/` with:

- the commit SHA and Glyphkiln outputs with manifests;
- expert files as delivered (with the designers' permission to retain them);
- the randomization seed, judge roster (anonymized), raw votes, comprehension
  answers and coding, and the defect checklist;
- a dated summary that keeps technical, craft, comprehension, and commercial
  evidence separate and says plainly where Glyphkiln lost.

A phase of the improvement plan is not complete if any previously passed brief
regresses on overall preference, comprehension, or defect count.
