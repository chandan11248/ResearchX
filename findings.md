# Findings: ResearchX standalone repository cut-over

## Repository state

- Outer remote: `https://github.com/chandan11248/ReSearchX.git`.
- Outer branch at audit time: `rx/project_/h`, with an older `main` still pointing at the initial commit.
- The outer repository tracked planning/docs and the `rx` launcher, but ignored the actual application under `ResearchX-harness/`.
- `ResearchX-harness/` was its own Git repository with a separate remote and history beginning from an external upstream project. Its reflog explicitly recorded the original upstream clone URL.

## Cleanup scope

- The README and website each used a hero image carrying legacy branding; both assets and their references are removed.
- Current product source had no live legacy identifiers after the previous rebrand, but the root architecture/docs and literature-review artifacts still contained old branding and an external repository link.
- Site/install scripts and package metadata still used the old organization GitHub location. These are retargeted to `chandan11248/ReSearchX`.
- Old nested Git metadata and the outer repository history must not be carried into the new published history.

## Preservation choices

- Keep the current ResearchX source tree and project documents.
- Keep the website layout and content, without the inherited hero artwork.
- Keep generated runtime/dependency directories ignored.
- Remove inherited release-history text rather than publishing a changelog that describes a different project.

## History reconstruction audit — 2026-09-24

- Before this audit, the working tree was clean and `main` pointed to `f83e1e8`, `Initial standalone ResearchX codebase`, which is also `origin/main`.
- The local reflog contains only the standalone cut-over snapshots `72780f7`, `8a3c7f2`, and `f83e1e8`; no month-long application-development chain is recoverable.
- The current tree is substantial and has clear boundaries: Pi runtime/CLI, model and system adapters, research/search and scientific connector extensions, workbench control-plane modules, skills/prompts, web surfaces, tests, and release tooling.
- Any new commit sequence will therefore be a retrospective reconstruction from the existing final tree. Commit messages and dates must not imply that Git recovered the original chronology.
- The remote `main` will remain untouched while a local review branch is built.

## Reconstruction verification — 2026-09-24

- The local `main` history contains eight ordered commits and all 903 tracked paths.
- Its tip matches the working tree exactly; compared with `main`, only the three audit files changed.
- `backup/main-before-history` and `origin/main` still point to `f83e1e8`; local `main` contains the organized development history.
- `npm run typecheck` passes, including the workbench web typecheck.
- `npm test` ran 1,034 tests: 881 passed and 153 failed. The failures are dominated by the environment rather than this history operation: the installed Node is `26.8.1` while the project accepts `22.22.0` through `25.x`, and sandboxed tests cannot bind localhost or create data under the user-level `.researchx` directory.
