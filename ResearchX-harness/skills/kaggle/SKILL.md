---
name: kaggle
description: Run experiments on Kaggle Kernels with 10-minute monitoring. Use for every experiment run — Kaggle is the default compute, local is for smoke checks only.
---

# Kaggle Experiments

Kaggle is the default compute backend. Local execution is for quick smoke checks only.

## Setup (once)

```bash
pip install kaggle
```

Then provide credentials **one** of these ways:

1. Environment: `KAGGLE_USERNAME` + `KAGGLE_KEY`, or
2. Token file at `~/.kaggle/kaggle.json` from kaggle.com → Settings → API → Create New Token:
   ```json
   {"username": "YOUR_USERNAME", "key": "YOUR_KEY"}
   ```

Verify with `kaggle kernels list --mine --page-size 1`.

## The loop (every experiment, no exceptions)

1. **Write locally first** — `outputs/experiments/<slug>/` with one entry `.py` script.
2. **Push** — `researchx_kaggle_push` (GPU on unless trivial). Save the slug + URL.
3. **Monitor every 10 minutes** — `researchx_kaggle_status` until `complete`/`error`/`cancelled`.
4. **Collect** — `researchx_kaggle_output` into `outputs/kaggle/<slug>/`.
5. **Report** — URL, state, key metrics, artifact paths, one-paragraph diagnosis on failure.

Shortcut: `researchx_kaggle_experiment` does push + poll + fetch in a single blocking call (default: 10-minute polls, up to 18 polls). For long or parallel runs, delegate to the `kaggle-runner` subagent instead.

## Rules

- Never run heavy compute locally when Kaggle is available.
- Never leave a pushed kernel unwatched.
- Never retry a failed kernel blindly — read logs, diagnose once, propose one fix.
