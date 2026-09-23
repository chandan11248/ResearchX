---
title: Quick Start
description: Start using ResearchX for paper search, research workflows, and code-aware review.
section: Getting Started
order: 2
---

This guide assumes you have already [installed ResearchX](/docs/getting-started/installation) and run `researchx setup`. If not, start there first.

## Launch the REPL

Start an interactive session by running:

```bash
researchx
```

You are dropped into a conversational REPL where you can ask research questions, run workflows, and interact with agents in natural language. Type your question and press Enter.

## Open the science workbench

Use the workbench when a research run needs chat, artifacts, notebooks, compute, settings, and provenance together:

```bash
researchx serve
```

The command starts a local authenticated web app with ResearchX projects, Pi-backed chat, ResearchX Bio Tools, generated artifacts, media/document/science previews, notebook execution records, compute inventory, and verification state. See the [Science Workbench guide](/docs/getting-started/workbench) for the full surface.

## Run a one-shot prompt

If you want a quick answer without entering the REPL, use the `--prompt` flag:

```bash
researchx --prompt "Summarize the key findings of Attention Is All You Need"
```

ResearchX processes the prompt, prints the response, and exits. This is useful for scripting or piping output into other tools.

## Start a deep research session

Deep research is the flagship workflow. It can call researcher agents to search, read, cross-reference, and synthesize information from academic papers and the web when the topic is broad enough to benefit from delegation:

```bash
researchx
> /deepresearch What are the current approaches to mechanistic interpretability in LLMs?
```

The agents collaborate to produce a structured research report with citations, key findings, and open questions. The full report is saved to your session directory for later reference.

## Find an ML training recipe

For applied ML work, use `/recipe` when you need a practical starting point rather than a broad literature survey:

```bash
researchx recipe "fine-tune a small model for math reasoning"
```

ResearchX ranks candidate recipes by result quality and feasibility, checks datasets and implementation paths when possible, and writes the final brief to `outputs/<slug>-recipe.md`.

## Work with files

ResearchX can read and write files in your working directory. Point it at a paper or codebase for targeted analysis:

```bash
researchx --cwd ~/papers
> /review arxiv:2301.07041
```

You can also ask ResearchX to draft documents, audit code, or compare multiple sources by referencing local files directly in your prompts.

## Explore slash commands

Type `/help` inside the REPL to see ResearchX's public research commands. Each command maps to a workflow or utility, such as `/deepresearch`, `/recipe`, `/review`, `/draft`, or `/watch`. You can also run any workflow directly from the CLI:

```bash
researchx deepresearch "transformer architectures for protein folding"
```

See the [Slash Commands reference](/docs/reference/slash-commands) for the curated public list.
