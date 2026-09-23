---
description: Run an experiment on Kaggle with 10-minute monitoring; write code locally first, then push and watch until done.
args: <experiment>
section: Research Workflows
topLevelCli: true
---
## Tool Discipline (Read First)

Tool names are literal. Use only tools visible in the current tool set.

- Search with `web_search`; do not call `search_web`, `google_search`, `google:search`, or `search_google`.
- Fetch URLs with `fetch_content`; do not call bare `fetch`, `WebFetch`, or `read_url_content`.
- If a tool returns `Tool not found` or `Invalid URL`, do not retry the same invalid call. Map to a canonical visible tool and valid arguments, or record the capability as blocked.

## Kaggle Experiment Loop

Kaggle is the default compute backend. For the requested experiment (or ask what to run if none was given):

1. **Write locally.** Create `outputs/experiments/<slug>/` with a single entry `.py` script plus helpers. Smoke-check imports locally if fast (`python -c "import ast; ast.parse(...)"` — never run heavy compute locally).
2. **Push.** Call `researchx_kaggle_push` with the directory (GPU on unless the task is trivial). Record the kernel slug and URL.
3. **Monitor every 10 minutes.** Poll `researchx_kaggle_status` until terminal state. Do not start other heavy work that would bury the monitoring; report progress as it arrives.
4. **Collect.** On `complete`, call `researchx_kaggle_output` into `outputs/kaggle/<slug>/`.
5. **Report.** Kernel URL, final state, key metrics from logs, artifact paths, and one-paragraph diagnosis if it failed.

Prefer delegating the whole loop to the `kaggle-runner` subagent so monitoring survives context pressure. For a single blocking call, `researchx_kaggle_experiment` does push + poll + fetch in one step.
