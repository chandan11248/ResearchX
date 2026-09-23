---
description: Skeptic pass — audit every claim in a draft for traceability to a verified citation or a logged experiment, then gate it behind a human checkpoint.
args: <item>
section: Research Workflows
topLevelCli: true
---
## Tool Discipline (Read First)

Tool names are literal. Use only tools visible in the current tool set.

- Verify references with `researchx_verify_citations`; do not re-implement verification with ad-hoc fetches when the tool is available.
- Record the final gate with `researchx_human_checkpoint`; do not improvise approval state in prose or files.
- Fetch URLs with `fetch_content`; search with `web_search`.
- If a tool returns `Tool not found` or `Invalid URL`, do not retry it — use a visible alternative or record the gap.

## Workflow

The input `<item>` is a draft (a path under `papers/` or `outputs/`, or an arXiv ID/URL). The skeptic pass is a
single-pass review answering one question: **does every claim trace to a verified citation or a logged experiment?**

1. **Inventory claims** — Read the draft and list every factual claim: numbers, benchmark results, quotes, causal or
   comparative statements, and definitions attributed to prior work. Write the inventory to `outputs/.drafts/<slug>-skeptic-claims.md` with one claim per line and its location (section/line).
2. **Trace each claim** — Classify every claim:
   - **citation-backed**: the draft cites a source. Extract the reference (DOI, arXiv ID, or title) and run
     `researchx_verify_citations` over all cited references in one call. A citation only supports the claim if the
     verdict is `verified` AND the source plausibly supports what the claim says (not just topic overlap).
   - **experiment-backed**: the claim comes from this project's own runs. It must name a concrete logged artifact
     (a file under `outputs/`, an experiment record, or the lab notebook `CHANGELOG.md`). Check the artifact exists
     and contains the claimed result. Open the file and quote the exact line in the trace record.
   - **unsupported**: neither of the above. Flag it.
3. **Write the verdict** — Write `outputs/<slug>-skeptic-pass.md` containing:
   - a verdict table: claim | location | trace type | evidence (citation verdict + provider similarity, or artifact
     path + quoted line) | verdict (TRACED / FLAGGED)
   - a blocking-issues list for every FLAGGED claim: wrong or unverifiable reference, missing artifact, overclaim
     relative to the evidence, or stale/contradicted result.
   - an explicit bottom line: the draft may proceed to the human checkpoint only when no FLAGGED claim remains, or
     when each flagged claim has a stated fix (remove the claim, soften it, or find real evidence).
4. **Gate the draft** — If the pass is clean (no FLAGGED claims, or all flagged claims have agreed fixes applied in
   this pass), call `researchx_human_checkpoint` with action `request`, the draft's path as `artifact`, and a summary
   of the pass result. Present the pending decision to the human verbatim and stop.
   - Never call the `record` action unless the human explicitly states approve/reject in chat. The agent must never
     self-approve.
   - If the pass is not clean, do not request a checkpoint; hand the blocking-issues list back for revision instead.
5. **Record the run** — Append a concise entry to `CHANGELOG.md`: what was reviewed, the verified/mismatch/not-found
   counts from `researchx_verify_citations`, and the checkpoint state.

Keep the output to claim traceability and the gate decision. Do not rewrite the draft's content beyond quoting claims.
