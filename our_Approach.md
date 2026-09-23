# ResearchX Approach

ResearchX is maintained as a standalone research-agent codebase. The runnable
application lives in `ResearchX-harness/` and is tracked by the root repository;
there is no nested upstream repository or wrapper runtime.

The product surface is ResearchX throughout: the `researchx` binary, CLI help,
prompts, skills, tools, workflows, website, runtime paths, and documentation.
User state lives under `~/.researchx`, and user-configurable environment variables
use the `RESEARCHX_*` namespace.

The runtime is organized around one agent loop with first-class research tools,
durable project artifacts, experiment records, evidence checks, and human
approval gates. The repository has its own release path and Git history.
