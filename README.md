# ResearchX

ResearchX is a standalone terminal research orchestrator for literature review,
experiments, evidence verification, and paper drafting.

The application lives in [`ResearchX-harness/`](ResearchX-harness/). It provides
a natural-language-first TUI, paper discovery and synthesis workflows,
experiment tracking, evidence checks, and a human approval gate before final
outputs.

## Quick start

```bash
cd ResearchX-harness
npm ci
npm run dev
```

See [`ResearchX-harness/GETTING_STARTED.md`](ResearchX-harness/GETTING_STARTED.md)
for model setup, local development, and optional compute integrations.

## Repository layout

- `ResearchX-harness/` — CLI, TUI, website, tools, prompts, skills, tests, and runtime integration.
- `literature-review/` — architecture review and research notes.
- `architecture.md` / `architecture.svg` / `architecture.png` — product architecture.
