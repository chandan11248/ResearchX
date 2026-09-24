import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function parseFrontmatter(text) {
	const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!match) return {};

	const frontmatter = {};
	for (const line of match[1].split("\n")) {
		const separator = line.indexOf(":");
		if (separator === -1) continue;
		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();
		if (!key) continue;
		frontmatter[key] = value;
	}
	return frontmatter;
}

export function readPromptSpecs(appRoot) {
	const dir = resolve(appRoot, "prompts");
	return readdirSync(dir)
		.filter((f) => f.endsWith(".md"))
		.map((f) => {
			const text = readFileSync(resolve(dir, f), "utf8");
			const fm = parseFrontmatter(text);
			return {
				name: f.replace(/\.md$/, ""),
				description: fm.description ?? "",
				args: fm.args ?? "",
				section: fm.section ?? "Research Workflows",
				topLevelCli: fm.topLevelCli === "true",
			};
		});
}

export const extensionCommandSpecs = [
	{ name: "capabilities", args: "", section: "Project & Session", description: "Show installed packages, discovery entrypoints, and runtime capability counts.", publicDocs: true },
	{ name: "commands", args: "", section: "Project & Session", description: "Browse ResearchX workflow, project, and approved live runtime commands.", publicDocs: true },
	{ name: "help", args: "", section: "Project & Session", description: "Show grouped ResearchX commands and prefill the editor with a selected command.", publicDocs: true },
	{ name: "researchx-model", args: "", section: "Project & Session", description: "Open ResearchX's approved research model menu (main + per-subagent overrides).", publicDocs: true },
	{ name: "setting", args: "", section: "Project & Session", description: "ResearchX settings: pick a model to view or set its context window.", publicDocs: true },
	{ name: "providers", args: "", section: "Project & Session", description: "Show custom API providers from custom-providers.json.", publicDocs: true },
	{ name: "init", args: "", section: "Project & Session", description: "Bootstrap AGENTS.md and session-log folders for a research project.", publicDocs: true },
	{ name: "outputs", args: "", section: "Project & Session", description: "Browse all research artifacts (papers, outputs, experiments, notes).", publicDocs: true },
	{ name: "service-tier", args: "", section: "Project & Session", description: "View or set the provider service tier override for supported models.", publicDocs: true },
	{ name: "thinking", args: "[level]", section: "Project & Session", description: "View or set the active model thinking level.", publicDocs: true },
	{ name: "tools", args: "", section: "Project & Session", description: "Browse public research tools with their source and parameter summary.", publicDocs: true },
];

export const livePackageCommandGroups = [
	{
		title: "Agents & Delegation",
		commands: [
			{ name: "agents", usage: "/agents" },
			{ name: "run", usage: "/run <agent> <task>" },
			{ name: "chain", usage: "/chain agent1 -> agent2" },
			{ name: "parallel", usage: "/parallel agent1 -> agent2" },
		],
	},
	{
		title: "Live Package Commands",
		commands: [
			{ name: "search", usage: "/search" },
			{ name: "web-results", usage: "/web-results" },
			{ name: "preview", usage: "/preview" },
			{ name: "hotkeys", usage: "/hotkeys" },
			{ name: "new", usage: "/new" },
			{ name: "quit", usage: "/quit" },
			{ name: "exit", usage: "/exit" },
		],
	},
];

export function isPublicLivePackageCommandName(name) {
	return livePackageCommandGroups.some((group) => group.commands.some((command) => command.name === name));
}

export const livePackageToolGroups = [
	{
		title: "Web & Source Retrieval",
		tools: [
			{ name: "web_search" },
			{ name: "fetch_content" },
			{ name: "get_search_content" },
			{ name: "code_search" },
		],
	},
	{
		title: "Document Access",
		tools: [
			{ name: "document_parse" },
			{ name: "document_search" },
			{ name: "document_screenshot" },
		],
	},
	{
		title: "Agents & Delegation",
		tools: [
			{ name: "subagent" },
		],
	},
];

export function isPublicLivePackageToolName(name) {
	return livePackageToolGroups.some((group) => group.tools.some((tool) => tool.name === name));
}

export const cliCommandSections = [
	{
		title: "Core",
		commands: [
			{ usage: "researchx", description: "Launch the interactive REPL." },
			{ usage: "researchx chat [prompt]", description: "Start chat explicitly, optionally with an initial prompt." },
			{ usage: 'researchx -- "- prompt"', description: "Start with a dash-leading research prompt after the end-of-options delimiter." },
			{ usage: 'researchx --prompt="- prompt"', description: "Run a dash-leading research prompt once and exit." },
			{ usage: "researchx help", description: "Show CLI help." },
			{ usage: "researchx setup", description: "Run the guided setup wizard." },
			{ usage: "researchx setup preview", description: "Install or verify preview dependencies." },
			{ usage: "researchx doctor", description: "Diagnose config, auth, Pi runtime, and preview dependencies." },
			{ usage: "researchx status", description: "Show the current setup summary." },
						{ usage: "researchx serve [--port N] [--no-open] [--no-auth]", description: "Open the local research workbench with project sessions, in-app Pi chat, optional plain localhost mode, ResearchX Bio Tools for exact OpenAlex/arXiv literature modes, PubMed workflows, trials, Grants.gov opportunity search, FDA regulatory data, ChEMBL molecular pharmacology, PubChem/ChEBI/BindingDB/Rhea chemistry modes, exact gnomAD/CADD/ClinVar/dbSNP variant modes, CIViC/ClinGen/Open Targets clinical-genomics modes, GTEx/PanglaoDB expression modes, MyGene/OLS/QuickGO/UniProt/Reactome/KEGG genes-and-ontologies modes, exact Ensembl and UCSC genome modes, exact ENCODE/JASPAR/UniBind regulation modes, exact GWAS/eQTL/PheWeb human-genetics modes, exact InterPro/Pfam/Human Protein Atlas/STRING protein-annotation modes, exact Antibody Registry reagent modes, exact Rfam RNA modes, exact ArrayExpress/GEO/MetaboLights/MGnify/PRIDE omics-archive modes, Ketcher KET/RXN/CDXML/CXSMILES chemistry artifacts, bio databases, artifacts, provenance, and the lab notebook." },
			{ usage: 'researchx rank "topic" [--expand-citations N] [--full-text-top N] [--critique-top N] [--synthesize]', description: "Rank papers for deciding what to read first, with transparent citation, method, reproducibility, and provenance evidence." },
			{ usage: "researchx paper <doi|arxiv-id|openalex-id|pmid|pmcid|title> [--fetch-full-text]", description: "Resolve legal full-text access candidates for one paper across OpenAlex, arXiv/alphaXiv, DOI, PMID/PMCID, and Europe PMC, with optional source-specific text fetching." },
		],
	},
	{
		title: "Model Management",
		commands: [
			{ usage: "researchx model list", description: "List available models in Pi auth storage." },
			{ usage: "researchx model login [id]", description: "Authenticate a model provider with OAuth or API-key setup." },
			{ usage: "researchx model logout [id]", description: "Clear stored auth for a model provider." },
			{ usage: "researchx model set <provider/model>", description: "Set the default approved research model (also accepts provider:model)." },
			{ usage: "researchx model tier [value]", description: "View or set the request service tier override." },
			{ usage: "researchx model context [model] [value]", description: "View or set a per-model context window (e.g. 512K, 1M)." },
		],
	},
	{
		title: "AlphaXiv",
		commands: [
			{ usage: "researchx alpha login", description: "Sign in to alphaXiv." },
			{ usage: "researchx alpha logout", description: "Clear alphaXiv auth." },
			{ usage: "researchx alpha status", description: "Check alphaXiv auth status." },
			{ usage: 'researchx alpha search "query"', description: "Search papers through ResearchX's bundled alphaXiv client." },
			{ usage: "researchx alpha get <id-or-url>", description: "Fetch paper content and local annotations." },
			{ usage: 'researchx alpha ask <id-or-url> "question"', description: "Ask a question about a paper." },
			{ usage: "researchx alpha code <github-url> [path]", description: "Inspect a paper repository." },
			{ usage: "researchx alpha annotate ...", description: "Read, write, list, or clear local paper notes." },
		],
	},
	{
		title: "Utilities",
		commands: [
			{ usage: "researchx packages list", description: "Show core and optional Pi package presets." },
			{ usage: "researchx packages install <preset>", description: "Install optional package presets on demand." },
			{ usage: "researchx search status", description: "Show Pi web-access status and config path." },
			{ usage: "researchx search set <provider> [api-key]", description: "Set the web search provider and optionally save its API key." },
			{ usage: "researchx search clear", description: "Reset web search provider to auto while preserving API keys." },
			{ usage: "researchx update [package]", description: "Update installed packages, or one package. Extensions update with their packages; there is no separate --extensions flag." },
		],
	},
];

export const legacyFlags = [
	{ usage: '--prompt "<text>"', description: "Run one prompt and exit." },
	{ usage: "--alpha-login", description: "Sign in to alphaXiv and exit." },
	{ usage: "--alpha-logout", description: "Clear alphaXiv auth and exit." },
	{ usage: "--alpha-status", description: "Show alphaXiv auth status and exit." },
	{ usage: "--model <provider/model|provider:model>", description: "Force a specific approved research model." },
	{ usage: "--service-tier <tier>", description: "Override request service tier for this run." },
	{ usage: "--thinking <level>", description: "Set thinking level: off | minimal | low | medium | high | xhigh | max." },
	{ usage: "--cwd <path>", description: "Set the working directory for tools." },
	{ usage: "--session-dir <path>", description: "Set the session storage directory." },
	{ usage: "--new-session", description: "Start a new persisted session." },
	{ usage: "--doctor", description: "Alias for `researchx doctor`." },
	{ usage: "--setup-preview", description: "Alias for `researchx setup preview`." },
];

export const topLevelCommandNames = ["alpha", "chat", "doctor", "help", "model", "packages", "paper", "rank", "search", "serve", "setup", "status", "update"];

export function formatSlashUsage(command) {
	return `/${command.name}${command.args ? ` ${command.args}` : ""}`;
}

export function formatCliWorkflowUsage(command) {
	return `researchx ${command.name}${command.args ? ` ${command.args}` : ""}`;
}

export function getExtensionCommandSpec(name) {
	return extensionCommandSpecs.find((command) => command.name === name);
}
