---
title: AlphaXiv
description: Search and retrieve academic papers through the AlphaXiv integration.
section: Tools
order: 1
---

AlphaXiv is the primary academic paper search and retrieval tool in ResearchX. It provides access to a large corpus of research papers, discussion threads, citation metadata, and source-specific paper text when available. The researcher agent uses AlphaXiv as its primary source for academic content.

## Authentication

AlphaXiv requires authentication. Set it up during initial setup or at any time:

```bash
researchx alpha login
```

Check your authentication status:

```bash
researchx alpha status
```

## What it provides

AlphaXiv gives ResearchX access to several capabilities that power the research workflows:

- **Paper search** -- Find papers by topic, author, keyword, or arXiv ID (`researchx alpha search`)
- **Paper content retrieval** -- Fetch alphaXiv-provided paper content or source-specific text when available (`researchx alpha get`)
- **Section-focused extraction (agent tool)** -- In-agent `alpha_get_paper` supports `section` and `sections` filters for abstract, introduction, methodology, experiments, results, discussion, limitations, and conclusion when available
- **Paper Q&A** -- Ask targeted questions about a paper's content (`researchx alpha ask`)
- **Code inspection** -- Read files from a paper's linked GitHub repository (`researchx alpha code`)
- **Annotations** -- Persistent local notes on papers across sessions (`researchx alpha annotate`)

## How it is used

ResearchX ships an `alpha-research` skill that teaches the agent to use ResearchX's alphaXiv tools for paper operations. The researcher agent uses them during workflows like deep research, literature review, and internal research review. When you provide an arXiv ID (like `2401.12345`), the agent fetches the paper via `researchx alpha get`.

You can also use ResearchX's bundled alphaXiv client directly from the terminal:

```bash
researchx alpha search "scaling laws"
researchx alpha get 2401.12345
researchx alpha ask 2401.12345 "What optimizer did they use?"
researchx alpha code https://github.com/org/repo src/model.py
```

## Configuration

Authentication state is managed by the bundled alphaXiv client and persists separately from ResearchX's own home directory. ResearchX stores its runtime state under `~/.researchx`; alphaXiv login state can be removed separately from `~/.ahub` during uninstall. No additional configuration is needed beyond logging in.

## Without AlphaXiv

If you choose not to authenticate with AlphaXiv, ResearchX still functions but with reduced academic search capabilities. It falls back to web search for finding papers, which works for well-known work but misses AlphaXiv citation metadata, discussion threads, and source-specific paper text when available. For serious research workflows, AlphaXiv authentication is strongly recommended.
