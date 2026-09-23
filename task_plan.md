# Task Plan: ResearchX standalone repository cut-over

## Goal

Publish the current ResearchX code and documentation as a genuinely standalone
codebase with no inherited branding, links, upstream Git history, nested-repo
metadata, or README hero asset.

## Phases

### Phase 1 — Audit and scope (complete)

- [x] Inspect outer and nested Git repositories, remotes, branches, and tracked files.
- [x] Locate legacy branding, upstream URLs, inherited history, and README assets.
- [x] Confirm the current runnable code lives under `ResearchX-harness/` and is currently ignored by the outer repository.

### Phase 2 — Standalone cleanup (complete)

- [x] Rewrite product/docs references to describe ResearchX without upstream identity.
- [x] Retarget repository/install/site URLs to `chandan11248/ReSearchX`.
- [x] Remove the inherited hero artwork and release-history artifact.
- [x] Remove nested and outer Git metadata from the published tree while preserving a recoverable local backup outside the repository.
- [x] Update ignore rules so the current source tree is included and generated/runtime state stays excluded.

### Phase 3 — Verification (complete)

- [x] Run case-insensitive scans for legacy upstream identifiers in intended-to-track files.
- [x] Run the project typecheck/build and focused tests available in the current environment.
- [x] Confirm the staged tree contains the codebase, excludes secrets/caches/build outputs, and has one fresh root commit.

### Phase 4 — Publish (complete)

- [x] Commit the clean tree as the new repository root.
- [x] Create the new `chandan11248/ResearchX` GitHub repository.
- [x] Force-push the fresh `main` history to `origin`.
- [x] Verify the remote branch and commit after the push.

### Phase 5 — Reconstruct development history (in progress)

- [x] Confirm the published repository currently contains one standalone root commit.
- [x] Check reflogs and unreachable objects for recoverable prior development commits.
- [x] Map the existing tree into implementation phases without changing product behavior.
- [x] Build a clearly labeled local reconstruction branch from the current tree.
- [x] Re-run verification and compare the reconstructed tip with the current source tree.
- [x] Leave the existing published `main` history unchanged until the user explicitly requests a remote rewrite.

## Decisions

- The outer `ReSearchX` repository becomes the single Git repository.
- `ResearchX-harness/` remains the code directory for this cut-over to avoid a risky source-tree rename; its contents are tracked by the outer repository.
- Old Git metadata is moved to `/private/tmp` as a recoverable backup, then excluded from the new repository.
- Generated dependencies, runtime state, secrets, and build outputs remain ignored.
- Both inherited hero assets are removed because both displayed legacy branding.
- The development commits use current timestamps; no historical dates are invented or presented as recovered chronology.
- The original published root is preserved at `backup/main-before-history`; `origin/main` remains unchanged pending an explicit publication decision.

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| None | — | — |

| No recoverable month-long history | Repository inspection | Only the standalone root and two prior cut-over snapshots are reachable from the local reflog; use a transparent reconstruction rather than claiming recovery. |
| Non-cumulative temporary index | First history build | The first draft rebuilt the staging index from empty at every commit, producing a docs-only tip; rebuild with one accumulating index before updating the review branch. |
| Ten paths omitted from stage groups | Second history build | Verification found `src/setup/*` and `literature-review/*` missing; include those paths in the core and documentation stages, then rebuild once more. |
