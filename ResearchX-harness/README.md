<p align="center">The open source AI research agent.</p>
<p align="center">
  <a href="GETTING_STARTED.md"><img alt="Docs" src="https://img.shields.io/badge/docs-getting--started-0d9668?style=flat-square" /></a>
  <a href="https://github.com/chandan11248/ReSearchX/blob/main/ResearchX-harness/LICENSE"><img alt="License" src="https://img.shields.io/github/license/chandan11248/ReSearchX?style=flat-square" /></a>
</p>

---

### Installation

> **Start here: [GETTING_STARTED.md](GETTING_STARTED.md)** — full Windows-first
> setup (prerequisites, model config, Kaggle, dev loop).

Build from source (Node 22–25 required, Node 26 is rejected):

```bash
git clone https://github.com/chandan11248/ReSearchX.git
cd ReSearchX/ResearchX-harness
npm ci
npm run dev
```

Standalone native bundles (with pinned Node.js runtime) are published under
[Releases](https://github.com/chandan11248/ReSearchX/releases) when
available. `researchx update` only refreshes installed Pi packages inside
ResearchX's environment; it does not replace the standalone runtime bundle itself.

To uninstall the standalone app, remove the launcher and runtime bundle, then optionally remove `~/.researchx` if you also want to delete settings, workbench app state, sessions, and installed package state. If you also want to delete alphaXiv login state, remove `~/.ahub`. See the installation guide for platform-specific paths.

Models are configured through a single custom-provider file — see
[GETTING_STARTED.md](GETTING_STARTED.md#3-connect-a-model-one-time). Point it at
any OpenAI-compatible endpoint (hosted, LM Studio at `http://localhost:1234/v1`,
Ollama/vLLM `/v1`, LiteLLM proxy) with `openai-completions`.

### Skills Only

If you want just the research skills without the full terminal app, copy them
straight from this repo — no installer needed:

- **Codex:** copy `skills/<name>/` to `~/.codex/skills/researchx-<name>/`
- **Repo-local (Claude/agent):** copy to `.agents/skills/researchx-<name>/`
- **OpenCode project-local:** copy to `.opencode/skills/researchx-<name>/`

The `skills/` and `prompts/` trees plus the repo guidance files they reference are
everything. They do not install the ResearchX terminal, bundled Node runtime, auth
storage, or Pi packages.

---

### What you type → what happens

```
$ researchx "what do we know about scaling laws"
→ Searches papers and web, produces a cited research brief

$ researchx -- "- summarize the strongest evidence first"
→ Preserves a research prompt that begins with a dash instead of parsing it as a CLI option

$ researchx --prompt="- summarize the strongest evidence first"
→ Runs a dash-leading research prompt once and exits

$ researchx deepresearch "mechanistic interpretability"
→ Multi-agent investigation with parallel researchers, synthesis, verification

$ researchx lit "RLHF alternatives"
→ Literature review with consensus, disagreements, open questions, and lab/PI corpus mode when the input names a research group

$ researchx rank "mechanistic interpretability sparse autoencoders"
→ Decides what to read first with citation, method, reproducibility, and provenance evidence

$ researchx rank "mechanistic interpretability sparse autoencoders" --expand-citations 2
→ Adds cited and citing papers to the local citation graph before scoring graph prestige

$ researchx rank "mechanistic interpretability sparse autoencoders" --full-text-top 3
→ Adds section-aware full-text evidence and checklist rubric answers before rescoring

$ researchx rank "mechanistic interpretability sparse autoencoders" --critique-top 5
→ Adds research-critique strengths, concerns, and follow-up questions grounded in score evidence

$ researchx rank "mechanistic interpretability sparse autoencoders" --synthesize
→ Writes an auditable model synthesis and names the selected model plus whether it was recommended or explicitly requested

$ researchx paper 10.7717/peerj.4375 --fetch-full-text
→ Resolves legal full-text access candidates for one paper and fetches source-specific text when available

$ researchx serve
→ Opens the standalone science workbench with projects, Pi chat, ResearchX Bio Tools, notebooks, compute, artifact previews, provenance, settings, skills, and onboarding context

$ researchx serve --no-auth
→ Opens the same local workbench at a plain localhost URL for trusted local testing

$ researchx audit 2401.12345
→ Compares paper claims against the public codebase

$ researchx replicate "chain-of-thought improves math"
→ Plans replication checks and runs them only after an explicit environment choice

$ researchx recipe "fine-tune a small model for math reasoning"
→ Finds ranked, implementable ML training recipes from papers, datasets, docs, and code
```

---

### Workflows

Ask naturally or use slash commands as shortcuts.

| Command | What it does |
| --- | --- |
| `researchx rank <topic>` | PaperRank scoring for deciding what to read first, with transparent evidence for citations, methods, reproducibility, and provenance |
| `researchx paper <id-or-title>` | Paper access resolver for one DOI, arXiv ID, OpenAlex ID, PMID, PMCID, or title, with OpenAlex, arXiv/alphaXiv, DOI, and Europe PMC candidates plus optional source-specific text fetching |
| `researchx serve` | Standalone science workbench with project/session navigation, project metadata, in-app Pi chat, optional `--no-auth` plain localhost mode, ResearchX Bio Tools, Ketcher chemistry sketch artifacts, notebooks, compute, Files host inventory for local, SSH/BYOC, and cloud-backed artifact contexts, audio/video/spreadsheet/notebook/LaTeX/science artifact previews including element-level HTML report annotations and KET/RXN/CDXML/CXSMILES chemistry sketches, artifact Notes and note preview modals, Cloud storage credential modal, Cloud export target/destination modal, frame records, frame message rows, frame backfill health records, lineage, provenance, settings, org-scoped app-data workbench state under `~/.researchx/orgs/<org_uuid>/workbench`, an org-level `researchx-workbench.db` mirror with physical tables for the full reference-shaped workbench ledger coverage map including compute egress/Modal environment fields and ResearchX-owned connector ledgers, watch routine state, skill source/license state, setup decision state, review feedback state, compute poller lease state, redacted credential state, onboarding intent context, verification files, and `CHANGELOG.md` lab-notebook entries |
| `/deepresearch <topic>` | Source-heavy multi-agent investigation |
| `/lit <topic-or-lab>` | Literature review from paper search and primary sources; lab/PI inputs map publication trajectories and originality-ranked papers |
| `/review <artifact>` | Research review with severity and revision plan |
| `/skeptic <artifact>` | Skeptic pass: trace every claim to a verified citation or a logged experiment, then open a human checkpoint before the draft is final |
| `/audit <item>` | Paper vs. codebase mismatch audit |
| `/replicate <paper>` | Plan replication checks; execute only after choosing an environment |
| `/recipe <task-or-paper>` | Ranked ML training recipes with dataset, method, code, and verification status |
| `/compare <topic>` | Source comparison matrix |
| `/draft <topic>` | Paper-style draft from research findings |
| `/autoresearch <idea>` | Bounded experiment loop with benchmark evidence |
| `/watch <topic>` | Research watch baseline with optional scheduled follow-up |
| `/btw <question>` | Side conversation while the main research agent is busy, with optional handoff back into the main thread |
| `/thinking [level]` | View or set model reasoning effort (`off` through `max`, model permitting) without leaving the REPL |
| `/outputs` | Browse all research artifacts |

---

### Agents

Four bundled research agents, invoked by workflow prompts when decomposition helps.

- **Researcher** — gather evidence across papers, web, repos, docs
- **Reviewer** — internal research critique with severity-graded feedback
- **Writer** — structured drafts from research notes
- **Verifier** — inline citations, source URL verification, dead link cleanup

---

### Skills & Tools

- **[AlphaXiv](https://www.alphaxiv.org/)** — paper search, Q&A, code reading, annotations (via ResearchX's `alpha` tools and `researchx alpha` command)
- **ResearchX Bio Tools** — ResearchX-owned open science connector catalog for literature, exact OpenAlex work/citation/reference/author/venue workflows, exact arXiv search and batch-paper retrieval, PubMed metadata, PMID/PMCID/DOI conversion, related-article links, citation matching, copyright/license checks, PMC full-text routing, bioRxiv/medRxiv preprint DOI lookup, date/category windows, published-preprint links, funder/ROR lookup, usage/content statistics, Europe PMC open-access full-text sections, citation graphs, authors, venues, OA status, ClinicalTrials.gov trial search, NCT details, sponsor programs, eligibility filters, investigator records, endpoint summaries, Grants.gov exact opportunity search, FDA labels, adverse events, recalls, Drugs@FDA applications, sponsor/status/route counts, pharmacologic classes, generic-equivalent active-ingredient sets, ChEMBL compound/drug/ADMET/bioactivity/mechanism/target workflows, PubChem compound/search/similarity/bioassay/safety workflows, ChEBI entity/ontology workflows, BindingDB target/compound workflows, editable Ketcher chemistry sketch seeds, gene, BioMart, Ensembl lookup/xref/VEP/homology/sequence/overlap workflows, MyGene query-many, OLS ontology, QuickGO annotation, UniProt entry, Reactome pathway, CellGuide, PanglaoDB marker genes and gene-to-cell-type workflows, exact Antibody Registry antibody/RRID/catalog/stat workflows, reagent, cell-type, metabolomics, genome-track, UCSC exact track/chromosome/conservation/TFBS workflows, UniBind TF-DNA binding, KEGG entry/search/link/ID-conversion workflows, InterPro/Pfam exact domain architecture, entry, clan, family protein/proteome modes, Human Protein Atlas exact gene/search modes, STRING exact ID mapping, network, similarity, and best-hit workflows, purchasable ZINC compounds, protein, predicted-structure, structure, EM-map, complex, interaction, exact ENCODE/JASPAR/UniBind regulation modes for experiments, biosamples, files, matrices, species/taxa/collections/releases, datasets, and regional TFBS, exact ArrayExpress/GEO/MetaboLights/MGnify/PRIDE omics-archive modes for experiments, samples, files, analyses, projects, and protein evidence, metagenomics, chemical-ontology, chemistry, pathway, exact Rfam RNA family metadata, accession/id conversion, seed alignment, covariance model, tree, region, structure-mapping, and sequence-search workflows, exact gnomAD short variant, gene, region, liftover, ClinVar-mirror, structural, and mitochondrial workflows, exact CADD variant/position/range scores, exact direct ClinVar search/accession/rsID workflows, exact dbSNP rsID/region workflows, GWAS Catalog exact association/study/trait/SNP workflows, eQTL Catalogue exact dataset and association workflows, PheWeb/FinnGen PheWAS workflows, GTEx dataset/tissue/sample/gene/expression/eQTL workflows, tissue/protein-atlas, expression, human-genetics, cBioPortal study/detail/mutation-frequency/mutation/CNA/clinical-attribute workflows, DepMap model/gene/dependency workflows, CIViC gene/variant/evidence/assertion/profile/disease/therapy workflows, ClinGen validity/dosage/actionability/classification workflows, Open Targets disease-drug/disease-target/drug/search workflows, and canceromics sources
- **[Hugging Face Hub](https://huggingface.co/docs/hub/api)** — dataset metadata, split/schema inspection, and small file reads from model, dataset, and Space repos
- **Web research** — multi-provider search, explicit proxy routing, bounded GitHub issue/PR documents, raw or question-grounded page retrieval, direct images, external fetched-content caching, stored-page passage lookup, and auditable source text; tools, commands, images, PDFs, and browser cookies remain independently gated
- **Session search** — indexed recall across prior research sessions
- **Artifact previews** — local workbench viewers for reports, JSON/JSONL, tables, PDFs, images, audio, video, XLSX workbooks, Jupyter notebooks, LaTeX, sequences, alignments, variants, genomes, KET/RXN/CDXML/CXSMILES/Molfile/SDF/SMILES chemistry artifacts, structures, trees, and tensors
- **Observability** — PostHog analytics, logs, distributed traces, and Pi AI runtime traces through OpenTelemetry metadata, with signal-specific HTTP OTLP routing for external collectors
- **Research execution options** — Docker, Modal, and RunPod instructions for explicitly chosen replication, benchmark, or dataset-heavy experiment runs; not service deployment or generic cloud administration
- **Workbench control plane** — local onboarding, project/session/frame state, upload-frame linkage, frame message rows, frame backfill health records, chat-produced artifact attachment, artifact/version lineage, Files host inventory for local workspace files, SSH/BYOC compute hosts, and cloud buckets, media/document/science previews, element-level HTML report annotations, artifact Notes and note preview modals, Cloud storage credential modal, Cloud export target/destination modal with audit logs, execution logs, verification checks, memory categories, watch routine records, skill source/license records, setup decision records, review feedback records, compute poller lease records, scoped settings, and redacted credential availability records under ResearchX's own runtime and workspace files

---

### How it works

Built on [Pi](https://github.com/badlogic/pi-mono) for the agent runtime, [alphaXiv](https://www.alphaxiv.org/) for paper search and analysis, and CLI tools for compute and execution. Runtime resources follow Pi's documented package model for [packages](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md), [extensions](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md), and [skills](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md). Hugging Face inspection uses the public [Hub API endpoints](https://huggingface.co/docs/hub/api) and `HF_TOKEN` / `HUGGINGFACE_HUB_TOKEN` environment variables documented by [`huggingface_hub`](https://huggingface.co/docs/huggingface_hub/main/en/package_reference/environment_variables). The ML recipe workflow was informed by the open-source [Hugging Face `ml-intern`](https://github.com/huggingface/ml-intern) research-agent repo, but is implemented as native ResearchX prompts, skills, and read-only tools. Research outputs are source-grounded — research claims link to papers, docs, or repos with direct URLs.

---

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor guide.

```bash
git clone https://github.com/chandan11248/ReSearchX.git
cd ReSearchX/ResearchX-harness
fnm use || fnm install 24
npm ci
npm test
npm run typecheck
npm run build
```

[Docs](GETTING_STARTED.md) · [MIT License](LICENSE)
