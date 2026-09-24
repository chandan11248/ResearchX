import { type Dirent, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
	DEFAULT_CONTEXT_WINDOW,
	getModelContextOverride,
	readCustomProvidersFile,
	registerProviderEntry,
	saveCustomProvidersFile,
	persistCustomProvidersModelsJson,
	setModelContextOverride,
} from "./custom-providers.js";

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const INHERIT_MAIN = "__inherit_main__";

type FrontmatterDocument = {
	lines: string[];
	body: string;
	eol: string;
	trailingNewline: boolean;
};

type SubagentModelConfig = {
	agent: string;
	model?: string;
	filePath: string;
};

type SelectOption<T> = {
	label: string;
	value: T;
};

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

type TargetChoice =
	| { type: "main" }
	| { type: "context"; provider: string; id: string }
	| { type: "subagent"; agent: string; model?: string };

function modelContextWindow(model: { provider: string; id: string; contextWindow?: unknown }): number | undefined {
	const override = getModelContextOverride(model.provider, model.id);
	if (override !== undefined) return override;
	return typeof model.contextWindow === "number" && Number.isFinite(model.contextWindow)
		? model.contextWindow
		: undefined;
}

export function formatTokens(value: number | undefined): string {
	if (value === undefined) return "unknown";
	if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`;
	if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}K`;
	return String(value);
}

const CONTEXT_PRESETS: Array<{ label: string; value: number }> = [
	{ label: "128K", value: 128_000 },
	{ label: "512K", value: 512_000 },
	{ label: "1M (ResearchX default)", value: DEFAULT_CONTEXT_WINDOW },
	{ label: "2M", value: 2_000_000 },
	{ label: "Custom…", value: -1 },
];

function parseContextInput(raw: string): number | undefined {
	const normalized = raw.trim().toLowerCase().replace(/,/g, "");
	if (!normalized) return undefined;
	const multiplier = normalized.endsWith("m") ? 1_000_000 : normalized.endsWith("k") ? 1_000 : 1;
	const numeric = Number(multiplier === 1 ? normalized : normalized.slice(0, -1));
	if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
	const value = Math.floor(numeric * multiplier);
	if (value < 1_000 || value > 100_000_000) return undefined;
	return value;
}

function expandHomePath(value: string): string {
	if (value === "~") return homedir();
	if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
	return value;
}

function resolveResearchXAgentDir(): string {
	const configured = process.env.PI_CODING_AGENT_DIR ?? process.env.RESEARCHX_CODING_AGENT_DIR;
	if (configured?.trim()) {
		return resolve(expandHomePath(configured.trim()));
	}
	return resolve(homedir(), ".researchx", "agent");
}

function formatModelSpec(model: { provider: string; id: string }): string {
	return `${model.provider}/${model.id}`;
}

function detectEol(text: string): string {
	return text.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeLineEndings(text: string): string {
	return text.replace(/\r\n/g, "\n");
}

function parseFrontmatterDocument(text: string): FrontmatterDocument | null {
	const normalized = normalizeLineEndings(text);
	const match = normalized.match(FRONTMATTER_PATTERN);
	if (!match) return null;

	return {
		lines: match[1].split("\n"),
		body: match[2] ?? "",
		eol: detectEol(text),
		trailingNewline: normalized.endsWith("\n"),
	};
}

function serializeFrontmatterDocument(document: FrontmatterDocument): string {
	const normalized = `---\n${document.lines.join("\n")}\n---\n${document.body}`;
	const withTrailingNewline =
		document.trailingNewline && !normalized.endsWith("\n") ? `${normalized}\n` : normalized;
	return document.eol === "\n" ? withTrailingNewline : withTrailingNewline.replace(/\n/g, "\r\n");
}

function parseFrontmatterKey(line: string): string | undefined {
	const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:/);
	return match?.[1]?.toLowerCase();
}

function getFrontmatterValue(lines: string[], key: string): string | undefined {
	const normalizedKey = key.toLowerCase();
	for (const line of lines) {
		const parsedKey = parseFrontmatterKey(line);
		if (parsedKey !== normalizedKey) continue;
		const separatorIndex = line.indexOf(":");
		if (separatorIndex === -1) return undefined;
		const value = line.slice(separatorIndex + 1).trim();
		return value.length > 0 ? value : undefined;
	}
	return undefined;
}

function upsertFrontmatterValue(lines: string[], key: string, value: string): string[] {
	const normalizedKey = key.toLowerCase();
	const nextLines = [...lines];
	const existingIndex = nextLines.findIndex((line) => parseFrontmatterKey(line) === normalizedKey);
	const serialized = `${key}: ${value}`;

	if (existingIndex !== -1) {
		nextLines[existingIndex] = serialized;
		return nextLines;
	}

	const descriptionIndex = nextLines.findIndex((line) => parseFrontmatterKey(line) === "description");
	const nameIndex = nextLines.findIndex((line) => parseFrontmatterKey(line) === "name");
	const insertIndex = descriptionIndex !== -1 ? descriptionIndex + 1 : nameIndex !== -1 ? nameIndex + 1 : nextLines.length;
	nextLines.splice(insertIndex, 0, serialized);
	return nextLines;
}

function removeFrontmatterKey(lines: string[], key: string): string[] {
	const normalizedKey = key.toLowerCase();
	return lines.filter((line) => parseFrontmatterKey(line) !== normalizedKey);
}

function normalizeAgentName(name: string): string {
	return name.trim().toLowerCase();
}

function getAgentsDir(agentDir: string): string {
	return join(agentDir, "agents");
}

function listAgentFiles(agentsDir: string): string[] {
	if (!existsSync(agentsDir)) return [];

	return readdirSync(agentsDir, { withFileTypes: true })
		.filter((entry: Dirent) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md"))
		.filter((entry) => !entry.name.endsWith(".chain.md"))
		.map((entry) => join(agentsDir, entry.name));
}

function readAgentConfig(filePath: string): SubagentModelConfig {
	const content = readFileSync(filePath, "utf8");
	const parsed = parseFrontmatterDocument(content);
	const fallbackName = basename(filePath, ".md");
	if (!parsed) return { agent: fallbackName, filePath };

	return {
		agent: getFrontmatterValue(parsed.lines, "name") ?? fallbackName,
		model: getFrontmatterValue(parsed.lines, "model"),
		filePath,
	};
}

function listSubagentModelConfigs(agentDir: string): SubagentModelConfig[] {
	return listAgentFiles(getAgentsDir(agentDir))
		.map((filePath) => readAgentConfig(filePath))
		.sort((left, right) => left.agent.localeCompare(right.agent));
}

function findAgentConfig(configs: SubagentModelConfig[], agentName: string): SubagentModelConfig | undefined {
	const normalized = normalizeAgentName(agentName);
	return (
		configs.find((config) => normalizeAgentName(config.agent) === normalized) ??
		configs.find((config) => normalizeAgentName(basename(config.filePath, ".md")) === normalized)
	);
}

function getAgentConfigOrThrow(agentDir: string, agentName: string): SubagentModelConfig {
	const configs = listSubagentModelConfigs(agentDir);
	const target = findAgentConfig(configs, agentName);
	if (target) return target;

	if (configs.length === 0) {
		throw new Error(`No subagent definitions found in ${getAgentsDir(agentDir)}.`);
	}

	const availableAgents = configs.map((config) => config.agent).join(", ");
	throw new Error(`Unknown subagent: ${agentName}. Available agents: ${availableAgents}`);
}

function setSubagentModel(agentDir: string, agentName: string, modelSpec: string): void {
	const normalizedModelSpec = modelSpec.trim();
	if (!normalizedModelSpec) throw new Error("Model spec cannot be empty.");

	const target = getAgentConfigOrThrow(agentDir, agentName);
	const content = readFileSync(target.filePath, "utf8");
	const parsed = parseFrontmatterDocument(content);

	if (!parsed) {
		const eol = detectEol(content);
		const injected = `---${eol}name: ${target.agent}${eol}model: ${normalizedModelSpec}${eol}---${eol}${content}`;
		writeFileSync(target.filePath, injected, "utf8");
		return;
	}

	const nextLines = upsertFrontmatterValue(parsed.lines, "model", normalizedModelSpec);
	if (nextLines.join("\n") !== parsed.lines.join("\n")) {
		writeFileSync(target.filePath, serializeFrontmatterDocument({ ...parsed, lines: nextLines }), "utf8");
	}
}

function unsetSubagentModel(agentDir: string, agentName: string): void {
	const target = getAgentConfigOrThrow(agentDir, agentName);
	const content = readFileSync(target.filePath, "utf8");
	const parsed = parseFrontmatterDocument(content);
	if (!parsed) return;

	const nextLines = removeFrontmatterKey(parsed.lines, "model");
	if (nextLines.join("\n") !== parsed.lines.join("\n")) {
		writeFileSync(target.filePath, serializeFrontmatterDocument({ ...parsed, lines: nextLines }), "utf8");
	}
}

async function selectOption<T>(
	ctx: CommandContext,
	title: string,
	options: SelectOption<T>[],
): Promise<T | undefined> {
	const selected = await ctx.ui.select(
		title,
		options.map((option) => option.label),
	);
	if (!selected) return undefined;
	return options.find((option) => option.label === selected)?.value;
}

async function setMainContextWindow(
	ctx: CommandContext,
	provider: string,
	id: string,
): Promise<void> {
	const picked = await selectOption(
		ctx,
		`Context window for ${provider}/${id}`,
		CONTEXT_PRESETS.map((preset) => ({ label: preset.label, value: preset.value })),
	);
	if (picked === undefined) return;
	let value = picked;
	if (picked === -1) {
		const raw = await ctx.ui.input("Custom context window (e.g. 128K, 1M, 2000000)", "1000000");
		if (raw === undefined) return;
		const parsed = parseContextInput(raw);
		if (parsed === undefined) {
			ctx.ui.notify("Invalid context window. Use 1K–100M, e.g. 512K or 1000000.", "error");
			return;
		}
		value = parsed;
	}
	// Write through to custom-providers.json when the model is file-defined so
	// the value survives relaunch; modelOverrides cover every other provider.
	const { file, path } = readCustomProvidersFile();
	const hasFileConfig = (file.providers ?? []).length > 0 || !!file.defaultModel;
	const entry = hasFileConfig ? (file.providers ?? []).find((candidate) => candidate.id === provider) : undefined;
	const fileModel = entry?.models?.find((model) => model.id === id);
	let persisted = `modelOverrides for ${provider}/${id}`;
	if (fileModel && entry) {
		fileModel.contextWindow = value;
		if (!saveCustomProvidersFile(file, path)) {
			ctx.ui.notify(`Could not write ${path}; override saved to auth storage only.`, "warning");
		} else {
			persistCustomProvidersModelsJson(file);
			registerProviderEntry(ctx.modelRegistry, entry);
			persisted = `${path} (+ live registry)`;
		}
	}
	if (!setModelContextOverride(provider, id, value)) {
		ctx.ui.notify("Could not persist the context-window override.", "error");
		return;
	}
	try {
		await ctx.modelRegistry.refresh();
	} catch {
		// Best effort; new sessions always pick the override up from disk.
	}
	ctx.ui.notify(
		`Context window for ${provider}/${id} set to ${formatTokens(value)} (persisted in ${persisted}). New sessions use it; reopen this menu to confirm. Oversized values fail at the provider if the backend supports less.`,
		"info",
	);
}

export function registerResearchXModelCommand(pi: ExtensionAPI): void {
	pi.registerCommand("researchx-model", {
		description: "Open ResearchX model menu (main + per-subagent overrides).",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("researchx-model requires interactive mode.", "error");
				return;
			}

			try {
				ctx.modelRegistry.refresh();
				const availableModels = [...ctx.modelRegistry.getAvailable()].sort((left, right) =>
					formatModelSpec(left).localeCompare(formatModelSpec(right)),
				);
				if (availableModels.length === 0) {
					ctx.ui.notify("No models available.", "error");
					return;
				}

				const agentDir = resolveResearchXAgentDir();
				const subagentConfigs = listSubagentModelConfigs(agentDir);
				const currentMain = ctx.model ? formatModelSpec(ctx.model) : "(none)";
				const currentMainWindow = ctx.model
					? formatTokens(modelContextWindow(ctx.model as { provider: string; id: string; contextWindow?: unknown }))
					: "unknown";

				const targetOptions: SelectOption<TargetChoice>[] = [
					{ label: `main (default): ${currentMain}`, value: { type: "main" } },
					{
						label: `context window: ${currentMainWindow} (main model)`,
						value: ctx.model
							? { type: "context" as const, provider: ctx.model.provider, id: ctx.model.id }
							: { type: "main" as const },
					},
					...subagentConfigs.map((config) => ({
						label: `${config.agent}: ${config.model ?? "default"}`,
						value: { type: "subagent" as const, agent: config.agent, model: config.model },
					})),
				];

				const target = await selectOption(ctx, "Choose target", targetOptions);
				if (!target) return;

				if (target.type === "context") {
					await setMainContextWindow(ctx, target.provider, target.id);
					return;
				}

				if (target.type === "main") {
					const selectedModel = await selectOption(
						ctx,
						"Select main model",
						availableModels.map((model) => {
							const spec = formatModelSpec(model);
							const suffix = spec === currentMain ? " (current)" : "";
							return { label: `${spec}${suffix}`, value: model };
						}),
					);
					if (!selectedModel) return;

					const success = await pi.setModel(selectedModel);
					if (!success) {
						ctx.ui.notify(`No API key found for ${selectedModel.provider}.`, "error");
						return;
					}
					ctx.ui.notify(`Main model set to ${formatModelSpec(selectedModel)}.`, "info");
					return;
				}

				const selectedSubagentModel = await selectOption(
					ctx,
					`Select model for ${target.agent}`,
					[
						{
							label: target.model ? "(inherit main default)" : "(inherit main default) (current)",
							value: INHERIT_MAIN,
						},
						...availableModels.map((model) => {
							const spec = formatModelSpec(model);
							const suffix = spec === target.model ? " (current)" : "";
							return { label: `${spec}${suffix}`, value: spec };
						}),
					],
				);
				if (!selectedSubagentModel) return;

				if (selectedSubagentModel === INHERIT_MAIN) {
					unsetSubagentModel(agentDir, target.agent);
					ctx.ui.notify(`${target.agent} now inherits the main model.`, "info");
					return;
				}

				setSubagentModel(agentDir, target.agent, selectedSubagentModel);
				ctx.ui.notify(`${target.agent} model set to ${selectedSubagentModel}.`, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}
