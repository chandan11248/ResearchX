import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface CustomProviderModel {
	id: string;
	name?: string;
	reasoning?: boolean;
	contextWindow?: number;
	maxTokens?: number;
}

export interface CustomProviderEntry {
	id: string;
	name?: string;
	api?: string;
	baseUrl: string;
	apiKey?: string;
	models?: CustomProviderModel[];
}

export interface CustomProvidersFile {
	providers?: CustomProviderEntry[];
	defaultModel?: string;
}

export function customProvidersPath(): string {
	const home = process.env.RESEARCHX_HOME?.trim() || process.env.RESEARCHX_HOME?.trim() || join(homedir(), ".researchx");
	return resolve(home, "custom-providers.json");
}

function agentDir(): string {
	const configured = process.env.PI_CODING_AGENT_DIR ?? process.env.RESEARCHX_CODING_AGENT_DIR;
	if (configured?.trim()) return resolve(configured.trim());
	return resolve(homedir(), ".researchx", "agent");
}

/** Minimal .env reader (KEY=VALUE, # comments, quotes) — no dependencies. */
export function readDotEnvFile(path: string): Record<string, string> {
	const values: Record<string, string> = {};
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return values;
	}
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
		const index = trimmed.indexOf("=");
		const key = trimmed.slice(0, index).trim();
		const value = trimmed
			.slice(index + 1)
			.trim()
			.replace(/^["']|["']$/g, "");
		if (key) values[key] = value;
	}
	return values;
}

function pickEnv(values: Record<string, string>, ...names: string[]): string | undefined {
	for (const name of names) {
		const value = values[name]?.trim() ?? process.env[name]?.trim();
		if (value) return value;
	}
	return undefined;
}

/** Dev fallback: build a provider from the project .env (cwd/.env) when no config file exists. */
export function providerFromDotEnv(cwd: string): CustomProvidersFile {
	const values = readDotEnvFile(join(cwd, ".env"));
	const baseUrl = pickEnv(values, "RESEARCHX_BASE_URL", "BASE_URL", "base_url");
	const apiKey = pickEnv(
		values,
		"RESEARCHX_API_KEY",
		"OPENCODE_API_KEY",
		"OPENCODE_API",
		"opencode_api",
		"OPENAI_API_KEY",
	);
	const model = pickEnv(values, "RESEARCHX_MODEL", "MODEL", "model");
	if (!baseUrl || !model) return {};
	const id = /opencode\.ai/i.test(baseUrl) ? "zen" : "env";
	return {
		providers: [
			{
				id,
				name: id === "zen" ? "OpenCode Zen" : "Custom API (.env)",
				api: "openai-completions",
				baseUrl,
				apiKey,
				models: [{ id: model, name: model, reasoning: true }],
			},
		],
		defaultModel: `${id}/${model}`,
	};
}

function readConfigFile(): { file: CustomProvidersFile; path: string; error?: string } {
	const path = customProvidersPath();
	if (!existsSync(path)) return { file: {}, path };
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (!parsed || typeof parsed !== "object") return { file: {}, path, error: "not a JSON object" };
		return { file: parsed as CustomProvidersFile, path };
	} catch (error) {
		return { file: {}, path, error: error instanceof Error ? error.message : String(error) };
	}
}

function toRegistryModels(entry: CustomProviderEntry): Array<{
	id: string;
	name: string;
	reasoning: boolean;
	input: Array<"text" | "image">;
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
}> {
	return (entry.models ?? []).map((model) => ({
		id: model.id,
		name: model.name ?? model.id,
		reasoning: model.reasoning ?? false,
		input: ["text" as const],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: model.contextWindow ?? 128000,
		maxTokens: model.maxTokens ?? 4096,
	}));
}

/** Register custom providers and persist the default model. Never throws. */
export async function installCustomProviders(
	_pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<string[]> {
	const { file: fileConfig, path, error } = readConfigFile();
	if (error) {
		ctx.ui.notify(`custom-providers.json ignored: ${error}`, "warning");
		return [];
	}
	// Dev fallback: project .env (base_url + key + model) when no config file exists.
	const hasFileConfig = (fileConfig.providers ?? []).length > 0 || !!fileConfig.defaultModel;
	const file = hasFileConfig ? fileConfig : providerFromDotEnv(ctx.cwd);
	const source = hasFileConfig ? path : `${join(ctx.cwd, ".env")} (dev fallback)`;
	const registry = ctx.modelRegistry;
	const registered: string[] = [];
	for (const entry of file.providers ?? []) {
		if (!entry?.id || !entry?.baseUrl) continue;
		try {
			registry.registerProvider(entry.id, {
				name: entry.name ?? entry.id,
				baseUrl: entry.baseUrl,
				apiKey: entry.apiKey,
				api: (entry.api ?? "openai-completions") as "openai-completions",
				models: toRegistryModels(entry),
			});
			registered.push(entry.id);
		} catch (err) {
			ctx.ui.notify(
				`custom provider "${entry.id}" failed: ${err instanceof Error ? err.message : String(err)}`,
				"warning",
			);
		}
	}
	if (file.defaultModel) {
		persistDefaultModel(file.defaultModel, ctx, source);
	}
	persistModelsJson(file);
	nudgeOnUnauthenticatedModel(registry, ctx, source);
	return registered;
}

/**
 * Mirror custom providers into Pi auth storage (`<agent-dir>/models.json`).
 * Model resolution and settings normalization run before extensions load, so a
 * provider that exists only in the extension registry is invisible at startup:
 * `normalizeResearchXSettings` then treats the persisted default model as
 * unavailable and resets it to a catalog model. Writing models.json keeps the
 * custom provider available to Pi from process start, making the persisted
 * default stable across launches and headless (`--prompt`) runs.
 */
function persistModelsJson(file: CustomProvidersFile): void {
	const entries = (file.providers ?? []).filter((entry) => entry?.id && entry?.baseUrl);
	if (entries.length === 0) return;
	const path = resolve(agentDir(), "models.json");
	let parsed: { providers?: Record<string, Record<string, unknown>> } = {};
	if (existsSync(path)) {
		try {
			const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
			if (raw && typeof raw === "object") parsed = raw as typeof parsed;
		} catch {
			// Leave an unreadable models.json alone rather than clobbering it.
			return;
		}
	}
	const providers: Record<string, Record<string, unknown>> = {
		...(parsed.providers && typeof parsed.providers === "object" ? parsed.providers : {}),
	};
	for (const entry of entries) {
		providers[entry.id] = {
			...(typeof providers[entry.id] === "object" && providers[entry.id] ? providers[entry.id] : {}),
			baseUrl: entry.baseUrl,
			api: entry.api ?? "openai-completions",
			...(entry.apiKey ? { apiKey: entry.apiKey } : {}),
			models: (entry.models ?? []).map((model) => ({ id: model.id })),
		};
	}
	try {
		writeFileSync(path, `${JSON.stringify({ providers }, null, 2)}\n`, "utf8");
	} catch {
		// Best effort; runtime registration still covers the current session.
	}
}

function persistDefaultModel(
	spec: string,
	ctx: ExtensionContext,
	source: string,
): void {
	const slash = spec.indexOf("/");
	if (slash <= 0 || slash === spec.length - 1) {
		ctx.ui.notify(`defaultModel "${spec}" ignored: expected "provider/model".`, "warning");
		return;
	}
	try {
		const settingsPath = join(agentDir(), "settings.json");
		const settings = existsSync(settingsPath)
			? (JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>)
			: {};
		settings.defaultProvider = spec.slice(0, slash);
		settings.defaultModel = spec.slice(slash + 1);
		writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
	} catch {
		ctx.ui.notify(`Could not persist default model from ${source}.`, "warning");
	}
}

/**
 * Extensions cannot switch models live (read-only session), so when the current
 * session model has no working auth, say so once with the fix — instead of
 * letting every message die with a raw provider error.
 */
function nudgeOnUnauthenticatedModel(
	registry: ExtensionContext["modelRegistry"],
	ctx: ExtensionContext,
	source: string,
): void {
	try {
		const current = ctx.model;
		if (!current) return;
		if (registry.hasConfiguredAuth(current)) return;
		ctx.ui.notify(
			[
				`Current model ${current.provider}/${current.id} has no working key.`,
				`Fix: edit ${source}, then /new session or pick it in /researchx-model.`,
			].join(" "),
			"warning",
		);
	} catch {
		// Guidance is best-effort.
	}
}

export function registerCustomProviderCommand(pi: ExtensionAPI): void {
	pi.registerCommand("providers", {
		description: "Show custom API providers from custom-providers.json or project .env.",
		handler: async (_args, ctx) => {
			const { file: fileConfig, path, error } = readConfigFile();
			if (error) {
				ctx.ui.notify(`custom-providers.json error: ${error}`, "error");
				return;
			}
			const hasFileConfig = (fileConfig.providers ?? []).length > 0 || !!fileConfig.defaultModel;
			const file = hasFileConfig ? fileConfig : providerFromDotEnv(ctx.cwd);
			const source = hasFileConfig ? path : `${join(ctx.cwd, ".env")} (dev fallback)`;
			const entries = file.providers ?? [];
			if (entries.length === 0) {
				ctx.ui.notify(
					`No custom providers. Create ${path} (see custom-providers.example.json) or add base_url + key + model to ${join(ctx.cwd, ".env")}.`,
					"warning",
				);
				return;
			}
			const lines = entries.map((entry) => {
				const models = (entry.models ?? []).map((model) => model.id).join(", ") || "(no models)";
				const key = entry.apiKey ? "key:set" : "key:missing";
				return `• ${entry.id} — ${entry.name ?? entry.id} [${key}]\n  ${entry.baseUrl}\n  models: ${models}`;
			});
			if (file.defaultModel) lines.push(`default: ${file.defaultModel}`);
			ctx.ui.notify([`Custom providers (${source}):`, ...lines].join("\n"), "info");
		},
	});
}
