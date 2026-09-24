# Getting Started with ResearchX (Windows-first guide)

This guide takes a stakeholder from zero to a running ResearchX dev environment
on **Windows**. macOS/Linux notes are included where they differ.

**What you will end up with:** the ResearchX terminal app running from source,
connected to a model, ready to develop.

---

## 1. Install prerequisites (one time)

| Need | Windows (PowerShell) | macOS / Linux |
|---|---|---|
| **Node.js 22–25** (NOT 26) | `winget install fnm` then restart the terminal, or install **Node 24 LTS** from https://nodejs.org | `fnm` / `nvm`, or Node 24 LTS installer |
| **Git** | `winget install Git.Git` | preinstalled / `xcode-select --install` |
| **Python 3.10+** (only for Kaggle runs) | `winget install Python.Python.3.13` | preinstalled / `brew install python` |

Verify Node (must print `v22.x`, `v23.x`, `v24.x`, or `v25.x`):

```powershell
node --version
```

If you used `fnm`, pin Node 24 for this project:

```powershell
fnm install 24
fnm use 24
```

> The launcher refuses Node 26 by design — if you see
> *"This newer Node release is not supported yet"*, switch to 24 and retry.

## 2. Clone and install (one time, ~5 minutes)

```powershell
git clone https://github.com/chandan11248/ResearchX-harness.git
cd ResearchX-harness
npm ci
```

`npm ci` downloads dependencies (needs internet). The first launch also builds
the Pi runtime workspace automatically — allow 1–2 extra minutes.

## 3. Connect a model (one time)

**Option A — Codex login (recommended if you have ChatGPT Plus/Pro).**
Uses the GPT line on your subscription, no API key needed:

```powershell
npm run dev -- model login codex
```

Pick `Browser login` (or `Device code login` on headless/SSH), complete it in
the browser, and ResearchX sets the newest Codex GPT as your default. Inside
the app, `/thinking high` raises reasoning effort.

**Option B — OpenCode Zen / Go (authorized API key).**
For Zen, sign in to the OpenCode Console, add billing/credits, and create an
API key. For Go, use an OpenCode Go subscription key. In the app run
`/providers` → `Connect OpenCode Zen` or `Connect OpenCode Go` and paste it
(the equivalent of OpenCode's `/connect`). You can also set
`OPENCODE_API_KEY` in your shell / `.env`, then choose `opencode/...` models
for Zen or `opencode-go/...` models for Go. The bundled Pi runtime supplies
the official OpenCode endpoints and model catalog; no app-identity headers are
spoofed.

If OpenCode returns `403 FreeTierError`, that is OpenCode's upstream free-tier
policy: free access is restricted to the OpenCode app. Use a paid/authorized
Zen or Go key, or choose another provider; changing headers will not bypass it.

**Option C — custom provider.** Any OpenAI-compatible endpoint works
(OpenRouter, LM Studio at `http://localhost:1234/v1`, Ollama/vLLM `/v1`,
LiteLLM proxy, …). Create the file `%USERPROFILE%\.researchx\custom-providers.json`
(macOS/Linux: `~/.researchx/custom-providers.json`):

```json
{
  "providers": [
    {
      "id": "my-provider",
      "name": "My Provider",
      "api": "openai-completions",
      "baseUrl": "https://YOUR-PROVIDER/v1",
      "apiKey": "sk-YOUR-KEY-HERE",
      "models": [
        {
          "id": "your-model-id",
          "name": "My Model",
          "reasoning": false,
          "contextWindow": 128000,
          "maxTokens": 8000
        }
      ]
    }
  ],
  "defaultModel": "my-provider/your-model-id"
}
```

For a local server you may omit `apiKey`. A commented template lives next to it:
`custom-providers.example.json`. Other subscription logins (Claude Max,
Copilot, …): `npm run dev -- model login` and pick from the list.

## 4. Launch

```powershell
npm run dev
```

You should see the blue **RESEARCHX** banner. Inside the app:

- `/providers` — all providers: custom (`key:set`) plus subscription logins; `/providers login codex` logs in without leaving the app
- `/researchx-model` — switch models
- `/help` — all commands; `/kaggle` runs experiments (see below)
- Just type normally for anything else — research, coding, writing, analysis.

Headless (no interaction): `npm run dev -- "summarize this paper: <file>"`.
Built binary instead of source: `npm run build`, then `node bin/researchx.js`.

## 5. Kaggle experiments (optional)

```powershell
pip install kaggle
```

Get a token: kaggle.com → your avatar → Settings → API → **Create New Token**.
It downloads `kaggle.json` — move it to `%USERPROFILE%\.kaggle\kaggle.json`
(macOS/Linux: `~/.kaggle/kaggle.json`), or set `KAGGLE_USERNAME` + `KAGGLE_KEY`.

Test it: `kaggle kernels list --mine --page-size 1`

In the app, `/kaggle <experiment>` writes code locally, pushes a GPU kernel,
checks status every 10 minutes, and downloads results to `outputs/kaggle/`.

## 6. Web search (optional, free)

ResearchX ships a `tinyfish_search` tool for latest/current topics. It needs
only a free key:

1. Get a key at https://agent.tinyfish.ai/api-keys (Search is free).
2. Save it: `researchx search set tinyfish <api-key>` (stored in
   `~/.researchx/web-search.json`), or set `TINYFISH_API_KEY` in your shell /
   `.env` (see `.env.example`).
3. Check it: `researchx search status` should show `TinyFish API configured: yes`.

Without any provider, Pi's built-in `web_search` stays unconfigured and the
agent will report that capability as blocked.

## 7. Developing (the daily loop)

```powershell
git pull origin main        # update (this repo is standalone — no upstream)
npm run dev                 # run from source
```

Before pushing a change:

```powershell
npx tsc --noEmit                                  # typecheck must be clean
node --import tsx --test --test-concurrency=1 tests/<your-area>.test.ts
```

Branch, commit, push, open a PR against `main` on GitHub.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `This newer Node release is not supported yet` | Use Node 24 (`fnm use 24`) |
| `Could not read an authenticated package-lock restore seed` | Delete `.researchx/npm`, `.researchx/runtime-workspace.tgz*` in the repo and relaunch (it rebuilds) |
| `invalid x-api-key` / 401 on every message | Your provider key is wrong or expired — fix `custom-providers.json`, then `/new` (old sessions keep the old model) |
| `403 FreeTierError` from OpenCode | OpenCode's free tier is app-only upstream — use a paid/authorized Zen or Go key, or another provider; do not spoof headers |
| `The 'kaggle' CLI is not installed` | `pip install kaggle` (Windows: `py -m pip install kaggle`) |
| Telemetry concerns | Nothing is sent anywhere unless you set `RESEARCHX_POSTHOG_KEY`. `RESEARCHX_TELEMETRY=off` disables it explicitly |
| Old `~/.researchx` folder exists | Harmless leftover from the previous base; ResearchX only reads `~/.researchx` |

## Where things live

- App code: `src/`, `extensions/` · Workflows: `prompts/` · Skills: `skills/`
- Your data (never committed): `%USERPROFILE%\.researchx\` — settings, auth, sessions, `custom-providers.json`
- Lab notebook (read before big work): `CHANGELOG.md`
- Contributor rules: `AGENTS.md`
