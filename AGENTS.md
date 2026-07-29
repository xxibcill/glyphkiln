# Repository instructions

- Preserve deterministic behavior: never use unseeded randomness in render paths.
- Keep user input as data. Never add dynamic code execution or network fetching.
- Add or update tests for every pixel-affecting change.
- Update the renderer or algorithm version when output pixels deliberately change.
- Run build, typecheck, lint, tests, and coverage before handing off work.
