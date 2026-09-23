---
name: alpha-research
description: Search, read, and query research papers via ResearchX's alphaXiv-backed alpha tools. Use when the user asks about academic papers, wants to find research on a topic, needs to read a specific paper, ask questions about a paper, inspect a paper's code repository, or manage paper annotations.
---

# Alpha Research CLI

Use visible ResearchX alpha tools when they are available. For shell commands, use `researchx alpha ...`; do not call the user's bare global `alpha` binary because it can be stale or unpatched.

## Commands

| Command | Description |
|---------|-------------|
| `researchx alpha search "<query>"` | Search papers. Prefer `--mode semantic` by default; use `--mode keyword` only for exact-term lookup and `--mode agentic` for broader retrieval. |
| `researchx alpha get <arxiv-id-or-url>` | Fetch paper content and any local annotation |
| `researchx alpha get --full-text <arxiv-id>` | Get raw full text instead of AI report |
| `researchx alpha ask <arxiv-id> "<question>"` | Ask a question about a paper's PDF |
| `researchx alpha code <github-url> [path]` | Read files from a paper's GitHub repo. Use `/` for overview |
| `researchx alpha annotate <paper-id> "<note>"` | Save a persistent annotation on a paper |
| `researchx alpha annotate --clear <paper-id>` | Remove an annotation |
| `researchx alpha annotate --list` | List all annotations |

## Auth

Run `researchx alpha login` to authenticate with alphaXiv. Check status with `researchx alpha status`.

## Examples

```bash
researchx alpha search "transformer scaling laws"
researchx alpha search --mode agentic "efficient attention mechanisms for long context"
researchx alpha get 2106.09685
researchx alpha ask 2106.09685 "What optimizer did they use?"
researchx alpha code https://github.com/karpathy/nanoGPT src/model.py
researchx alpha annotate 2106.09685 "Key paper on LoRA - revisit for adapter comparison"
```

## When to use

- Academic paper search, reading, Q&A → ResearchX alpha tools or `researchx alpha`
- Current topics (products, releases, docs) → web search tools
- Mixed topics → combine both
