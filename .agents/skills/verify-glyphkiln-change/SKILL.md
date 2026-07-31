---
name: verify-glyphkiln-change
description: Validate Glyphkiln changes before handoff, pull request, or release by inspecting the diff, selecting focused tests and generated-artifact checks, and running the required build, typecheck, lint, test, and coverage gates. Use when asked to test, verify, validate, audit, prepare, or finish changes anywhere in this repository, and after repository skill, agent harness, pixel-affecting, schema, Core, App, migration, deployment, or dependency changes.
---

# Verify Glyphkiln Change

Produce an evidence-backed verification result without hiding failures or
regenerating artifacts merely to make checks pass.

## Inspect before running

1. Read `AGENTS.md`, `package.json`, and the current `git status` and diff.
2. Read [references/verification-matrix.md](references/verification-matrix.md)
   and select every focused or generated-artifact check implicated by the diff.
3. Note pre-existing uncommitted files and preserve them.
4. Determine whether the change affects repository skills, agent harnesses,
   pixels, schemas, Unicode data, fixtures, examples, package exports, licenses,
   migrations, standalone packaging, deployment, or dependencies.

## Run focused checks

Run the smallest owning test or workspace suite first to get fast, attributable
feedback. Fix failures only when the user asked for implementation or the
failure is caused by the current change.

Run relevant generated-artifact commands in verify mode. Do not run an update
command unless the requested change deliberately owns the resulting artifact
change.

For a deliberate pixel change:

1. Confirm the appropriate renderer, template, or algorithm version changed.
2. Run non-visual tests before baseline generation.
3. Generate candidates with `npm run test:update-visuals` only when authorized
   by the intended change.
4. Inspect every changed design, PNG, and manifest together.
5. Reject unexplained baseline churn.

## Run the mandatory handoff gate

Run every command under **Required for every handoff** in the verification
matrix from the repository root. Do not substitute a focused test for these
root checks. Use the root commands so workspace scripts include standalone,
isolation, deterministic text-layout, and README-example coverage.

Run the commands separately so a failure is attributed to one gate. Continue
with independent checks when useful, but never report an overall pass while a
required gate is failing.

## Review the resulting tree

1. Re-run `git status` and inspect generated or formatted changes.
2. Confirm no secret, local environment file, build output, coverage output, or
   package archive was added accidentally.
3. Confirm each pixel-affecting change has a regression test and deliberate
   version bump.
4. Confirm user-visible behavior has an appropriate Changeset.
5. Confirm new dependencies are pinned consistently and covered by license and
   audit policy when applicable.

## Report

List:

- focused and generated-artifact checks run;
- each mandatory gate with pass, fail, or not run;
- total relevant test result when available;
- baseline or generated-file changes reviewed;
- remaining failures, whether they appear introduced or pre-existing, and the
  evidence for that classification;
- any review step that still requires a human, such as visual approval.

Never claim success from command intent; report only completed command results.
