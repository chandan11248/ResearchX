# ResearchX

ResearchX is a standalone terminal research orchestrator for literature review,
experiments, evidence verification, and paper drafting.

## Product goals

- Natural-language-first TUI for research work.
- Paper discovery, ranking, synthesis, and code-versus-paper audits.
- Durable experiment branches, findings memory, and repeated-failure detection.
- Citation and claim-to-evidence verification.
- Mandatory human approval before a draft is considered final.
- Source-grounded paper drafting with a skeptic/reviewer pass.

## Current implementation direction

The application lives in `ResearchX-harness/` and is published as part of this
repository. ResearchX owns the product name, CLI, prompts, tools, workflows,
website, runtime configuration, and documentation. The repository is maintained
as a standalone codebase with its own history and release path.
