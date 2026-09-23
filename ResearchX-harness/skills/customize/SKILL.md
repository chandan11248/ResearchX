---
name: customize
description: Configure ResearchX specialists, skills, connectors, permissions, memory categories, compute providers, and project setup. Use when the task asks to customize the research workbench or create a reusable ResearchX research capability.
---

# Customize

Use this skill for ResearchX-owned workbench customization.

Workflow:

1. Decide whether the request belongs in a specialist prompt, skill, connector, setting, permission grant, memory category, compute provider, or project/session context.
2. Use the narrowest durable layer. Specialists live in `.researchx/agents/`; reusable skills live in `skills/`; workbench settings live in `.researchx/workbench/settings.json`.
3. Keep user-facing names ResearchX-owned and domain-centered. Do not expose local reference-app paths or connector names.
4. Verify the change through the workbench state or Pi command discovery, not only by reading files.
5. Record setup state and verification in the active plan or changelog when the customization changes product behavior.

Prefer a concrete research capability over a generic productivity surface.
