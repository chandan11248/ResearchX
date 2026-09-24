import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AuthEvent, AuthPrompt } from "@earendil-works/pi-ai";

import { choosePreferredModelRecord, getAvailableModelRecords } from "../../src/model/catalog.js";
import { createModelRuntime } from "../../src/model/registry.js";
import { openUrl } from "../../src/system/open-url.js";
import { formatOpenCodeProviderError } from "../../src/model/opencode.js";

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

/** Default context window for ResearchX custom providers (1M tokens). */
export const DEFAULT_CONTEXT_WINDOW = 1_000_000;
const DEFAULT_MAX_TOKENS = 4096;

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
		contextWindow: model.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
		maxTokens: model.maxTokens ?? DEFAULT_MAX_TOKENS,
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
		const result = registerProviderEntry(registry, entry);
		if (result.registered) {
			registered.push(entry.id);
		} else if (result.error) {
			ctx.ui.notify(`custom provider "${entry.id}" failed: ${result.error}`, "warning");
		}
	}
	if (file.defaultModel) {
		persistDefaultModel(file.defaultModel, ctx, source);
	}
	persistModelsJson(file);
	nudgeOnUnauthenticatedModel(registry, ctx, source);
	return registered;
}

type RegistryLike = {
	registerProvider: (
		id: string,
		config: {
			name: string;
			baseUrl: string;
			apiKey?: string;
			api: "openai-completions";
			models: Array<{
				id: string;
				name: string;
				reasoning: boolean;
				input: Array<"text" | "image">;
				cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
				contextWindow: number;
				maxTokens: number;
			}>;
		},
	) => void;
};

/** Register one custom provider entry on a live model registry. Never throws. */
export function registerProviderEntry(
	registry: RegistryLike,
	entry: CustomProviderEntry,
): { registered: boolean; error?: string } {
	if (!entry?.id || !entry?.baseUrl) return { registered: false };
	try {
		registry.registerProvider(entry.id, {
			name: entry.name ?? entry.id,
			baseUrl: entry.baseUrl,
			apiKey: entry.apiKey,
			api: (entry.api ?? "openai-completions") as "openai-completions",
			models: toRegistryModels(entry),
		});
		return { registered: true };
	} catch (err) {
		return { registered: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/** Read the file-backed custom provider config (no .env fallback). */
export function readCustomProvidersFile(): { file: CustomProvidersFile; path: string; error?: string } {
	return readConfigFile();
}

/** Persist the file-backed custom provider config. Returns false on write failure. */
export function saveCustomProvidersFile(file: CustomProvidersFile, path: string): boolean {
	try {
		writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
		return true;
	} catch {
		return false;
	}
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
type PersistedProviderRecord = Record<string, unknown> & {
	providers?: Record<string, Record<string, unknown>>;
};

type PersistedModelEntry = {
	id: string;
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
};

function asPersistedModelEntries(value: unknown): PersistedModelEntry[] {
	if (!Array.isArray(value)) return [];
	const entries: PersistedModelEntry[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		if (typeof record.id !== "string" || !record.id) continue;
		const entry: PersistedModelEntry = { id: record.id };
		if (typeof record.name === "string" && record.name) entry.name = record.name;
		if (typeof record.contextWindow === "number" && Number.isFinite(record.contextWindow)) {
			entry.contextWindow = record.contextWindow;
		}
		if (typeof record.maxTokens === "number" && Number.isFinite(record.maxTokens)) {
			entry.maxTokens = record.maxTokens;
		}
		entries.push(entry);
	}
	return entries;
}

/**
 * Merge file-declared models with existing models.json entries so values set
 * elsewhere (e.g. the /researchx-model context-window editor) survive a
 * relaunch. File-declared fields win; otherwise existing values win; the
 * ResearchX 1M default fills a missing contextWindow.
 */
export function mergePersistedModels(
	existing: unknown,
	fileModels: CustomProviderModel[],
): PersistedModelEntry[] {
	const existingById = new Map(asPersistedModelEntries(existing).map((entry) => [entry.id, entry]));
	return fileModels.map((model) => {
		const prev = existingById.get(model.id);
		const entry: PersistedModelEntry = { id: model.id };
		const name = model.name ?? prev?.name;
		if (name) entry.name = name;
		entry.contextWindow = model.contextWindow ?? prev?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
		const maxTokens = model.maxTokens ?? prev?.maxTokens;
		if (maxTokens !== undefined) entry.maxTokens = maxTokens;
		return entry;
	});
}

function readModelsJson(): PersistedProviderRecord | undefined {
	const path = resolve(agentDir(), "models.json");
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (raw && typeof raw === "object") return raw as PersistedProviderRecord;
	} catch {
		// Missing file: start empty. Unreadable file: signal to leave it alone.
		if (!existsSync(path)) return {};
		return undefined;
	}
	return {};
}

function writeModelsJson(parsed: PersistedProviderRecord): boolean {
	try {
		writeFileSync(resolve(agentDir(), "models.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
		return true;
	} catch {
		return false;
	}
}

export function persistCustomProvidersModelsJson(file: CustomProvidersFile): void {
	const entries = (file.providers ?? []).filter((entry) => entry?.id && entry?.baseUrl);
	if (entries.length === 0) return;
	const parsed = readModelsJson();
	// Leave an unreadable models.json alone rather than clobbering it.
	if (!parsed) return;
	const providers: Record<string, Record<string, unknown>> = {
		...(parsed.providers && typeof parsed.providers === "object" ? parsed.providers : {}),
	};
	for (const entry of entries) {
		const existingProvider =
			typeof providers[entry.id] === "object" && providers[entry.id] ? providers[entry.id]! : {};
		providers[entry.id] = {
			...existingProvider,
			baseUrl: entry.baseUrl,
			api: entry.api ?? "openai-completions",
			...(entry.apiKey ? { apiKey: entry.apiKey } : {}),
			models: mergePersistedModels(existingProvider.models, entry.models ?? []),
		};
	}
	parsed.providers = providers;
	writeModelsJson(parsed);
}

/** Backwards-compatible alias used before the merge-preserving rewrite. */
function persistModelsJson(file: CustomProvidersFile): void {
	persistCustomProvidersModelsJson(file);
}

/**
 * Set a per-model context-window override in Pi auth storage (`modelOverrides`
 * in `<agent-dir>/models.json`). Works for any provider (custom, Zen, Codex,
 * …) without touching provider endpoints or keys. Survives relaunch because
 * the custom-provider sync preserves unknown provider fields.
 */
export function setModelContextOverride(providerId: string, modelId: string, contextWindow: number): boolean {
	const parsed = readModelsJson();
	if (!parsed) return false;
	const providers: Record<string, Record<string, unknown>> = {
		...(parsed.providers && typeof parsed.providers === "object" ? parsed.providers : {}),
	};
	const existing =
		typeof providers[providerId] === "object" && providers[providerId] ? { ...providers[providerId]! } : {};
	const overrides: Record<string, unknown> =
		existing.modelOverrides && typeof existing.modelOverrides === "object"
			? { ...(existing.modelOverrides as Record<string, unknown>) }
			: {};
	const prev = overrides[modelId] && typeof overrides[modelId] === "object" ? { ...(overrides[modelId] as Record<string, unknown>) } : {};
	prev.contextWindow = contextWindow;
	overrides[modelId] = prev;
	existing.modelOverrides = overrides;
	providers[providerId] = existing;
	parsed.providers = providers;
	return writeModelsJson(parsed);
}

/** Read a per-model context-window override from Pi auth storage, if present. */
export function getModelContextOverride(providerId: string, modelId: string): number | undefined {
	const parsed = readModelsJson();
	if (!parsed || !parsed.providers || typeof parsed.providers !== "object") return undefined;
	const provider = parsed.providers[providerId];
	if (!provider || typeof provider !== "object") return undefined;
	const overrides = provider.modelOverrides;
	if (!overrides || typeof overrides !== "object") return undefined;
	const entry = (overrides as Record<string, unknown>)[modelId];
	if (!entry || typeof entry !== "object") return undefined;
	const value = (entry as Record<string, unknown>).contextWindow;
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
		description: "Show providers (custom API + subscription OAuth). Usage: /providers [login [codex]]",
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			if (parts[0]?.toLowerCase() === "login") {
				await loginSubscriptionProvider(ctx, parts[1]);
				return;
			}
			// Interactive menu (arrow keys + Enter) when UI is available; plain text otherwise.
			if (ctx.hasUI && parts.length === 0) {
				await providersMenu(ctx);
				return;
			}
			await showProvidersStatus(ctx);
		},
	});
}

type ProviderMenuAction =
	| { type: "login-codex" }
	| { type: "login-other" }
	| { type: "connect-zen" }
	| { type: "connect-go" }
	| { type: "view-custom" };

async function providersMenu(ctx: ProviderCommandContext): Promise<void> {
	const codexOn = await isCodexLoggedIn();
	const actions: Array<{ label: string; value: ProviderMenuAction }> = [
		{
			label: `Login with Codex (ChatGPT Plus/Pro) [${codexOn ? "login:set" : "login:missing"}]`,
			value: { type: "login-codex" },
		},
		{ label: "Connect OpenCode Zen (API key)", value: { type: "connect-zen" } },
		{ label: "Connect OpenCode Go (API key)", value: { type: "connect-go" } },
		{ label: "Other subscription login…", value: { type: "login-other" } },
		{ label: "View custom providers", value: { type: "view-custom" } },
	];
	const picked = await ctx.ui.select("Providers — choose an action (↑↓ + Enter)", actions.map((action) => action.label));
	const action = actions.find((entry) => entry.label === picked)?.value;
	if (!action) return;
	if (action.type === "login-codex") {
		await loginSubscriptionProvider(ctx, "openai-codex");
		return;
	}
	if (action.type === "connect-zen") {
		await connectGatewayKey(ctx, "opencode", "OpenCode Zen (https://opencode.ai/auth → create an authorized API key)");
		return;
	}
	if (action.type === "connect-go") {
		await connectGatewayKey(ctx, "opencode-go", "OpenCode Go (https://opencode.ai/auth → OpenCode Go API key)");
		return;
	}
	if (action.type === "login-other") {
		await loginSubscriptionProvider(ctx, undefined);
		return;
	}
	await showProvidersStatus(ctx);
}

/** opencode `/connect` equivalent: paste a gateway API key, store it in Pi auth storage. */
async function connectGatewayKey(ctx: ProviderCommandContext, providerId: string, keySource: string): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify(`Connecting ${providerId} needs interactive mode. Run \`researchx model login ${providerId}\` from a terminal instead.`, "error");
		return;
	}
	const key = await ctx.ui.input(`Paste ${providerId} API key`, keySource);
	if (!key?.trim()) return;
	let runtime: Awaited<ReturnType<typeof createModelRuntime>>;
	try {
		runtime = await createModelRuntime(authPath());
	} catch (error) {
		ctx.ui.notify(`Could not open model auth storage: ${error instanceof Error ? error.message : String(error)}`, "error");
		return;
	}
	try {
		await runtime.login(providerId, "api_key", {
			prompt: async () => key.trim(),
			notify: () => undefined,
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Connect failed: ${formatOpenCodeProviderError(detail)}`, "error");
		return;
	}
	ctx.ui.notify(`${providerId} key saved.`, "info");
	await maybeSetSubscriptionDefault(ctx, providerId);
}

async function isCodexLoggedIn(): Promise<boolean> {
	try {
		const runtime = await createModelRuntime(authPath());
		const credentials = await runtime.listCredentials();
		return credentials.some((credential) => credential.providerId === "openai-codex");
	} catch {
		return false;
	}
}

async function showProvidersStatus(ctx: ProviderCommandContext): Promise<void> {
	const { file: fileConfig, path, error } = readConfigFile();
	if (error) {
		ctx.ui.notify(`custom-providers.json error: ${error}`, "error");
		return;
	}
	const hasFileConfig = (fileConfig.providers ?? []).length > 0 || !!fileConfig.defaultModel;
	const file = hasFileConfig ? fileConfig : providerFromDotEnv(ctx.cwd);
	const source = hasFileConfig ? path : `${join(ctx.cwd, ".env")} (dev fallback)`;
	const entries = file.providers ?? [];
	const lines: string[] = [];
	if (entries.length === 0) {
		lines.push(
			`No custom providers. Create ${path} (see custom-providers.example.json) or add base_url + key + model to ${join(ctx.cwd, ".env")}.`,
		);
	} else {
		lines.push(`Custom providers (${source}):`);
		for (const entry of entries) {
			const models = (entry.models ?? []).map((model) => model.id).join(", ") || "(no models)";
			const key = entry.apiKey ? "key:set" : "key:missing";
			lines.push(`• ${entry.id} — ${entry.name ?? entry.id} [${key}]\n  ${entry.baseUrl}\n  models: ${models}`);
		}
		if (file.defaultModel) lines.push(`default: ${file.defaultModel}`);
	}
	lines.push(...(await subscriptionStatusLines()));
	ctx.ui.notify(lines.join("\n"), entries.length === 0 ? "warning" : "info");
}

/** Short names for subscription OAuth logins (mirrors src/model/commands.ts aliases). */
const SUBSCRIPTION_LOGIN_ALIASES: Record<string, string> = {
	codex: "openai-codex",
	chatgpt: "openai-codex",
};

export function resolveSubscriptionProviderId(input: string | undefined): string | undefined {
	const normalized = input?.trim().toLowerCase();
	if (!normalized) return undefined;
	return SUBSCRIPTION_LOGIN_ALIASES[normalized] ?? normalized;
}

function authPath(): string {
	return resolve(agentDir(), "auth.json");
}

async function subscriptionStatusLines(): Promise<string[]> {
	try {
		const runtime = await createModelRuntime(authPath());
		const credentials = await runtime.listCredentials();
		const has = (id: string) => credentials.some((credential) => credential.providerId === id);
		const hasOpenCodeEnvKey = Boolean(process.env.OPENCODE_API_KEY?.trim());
		const hasOpenCodeKey = (id: string) => has(id) || (hasOpenCodeEnvKey && (id === "opencode" || id === "opencode-go"));
		return [
			"Subscription logins (OAuth):",
			`• openai-codex — OpenAI Codex (ChatGPT Plus/Pro) [${has("openai-codex") ? "login:set" : "login:missing"}]`,
			"  configure: /providers login codex",
			"API-key gateways (/connect equivalent):",
			`• opencode — OpenCode Zen (pay-per-use GPT/Claude/Gemini) [${hasOpenCodeKey("opencode") ? "key:set" : "key:missing"}]`,
			`• opencode-go — OpenCode Go (subscription) [${hasOpenCodeKey("opencode-go") ? "key:set" : "key:missing"}]`,
			"  configure: /providers menu → Connect OpenCode Zen/Go, or `researchx model login opencode` / `researchx model login opencode-go`",
		];
	} catch {
		return [
			"Subscription logins (OAuth):",
			"• openai-codex — status unknown",
			"  configure: /providers login codex",
		];
	}
}

type ProviderCommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

async function loginSubscriptionProvider(ctx: ProviderCommandContext, rawId: string | undefined): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify("Provider login requires interactive mode. Run `researchx model login codex` from a terminal instead.", "error");
		return;
	}
	let runtime: Awaited<ReturnType<typeof createModelRuntime>>;
	try {
		runtime = await createModelRuntime(authPath());
	} catch (error) {
		ctx.ui.notify(`Could not open model auth storage: ${error instanceof Error ? error.message : String(error)}`, "error");
		return;
	}
	const oauthProviders = runtime.getProviders().filter((provider) => Boolean(provider.auth?.oauth));
	let providerId = resolveSubscriptionProviderId(rawId);
	if (!providerId) {
		const ordered = [...oauthProviders].sort(
			(left, right) => Number(right.id === "openai-codex") - Number(left.id === "openai-codex"),
		);
		const picked = await ctx.ui.select(
			"Subscription login",
			ordered.map((provider) => `${provider.auth.oauth?.name ?? provider.name ?? provider.id} — ${provider.id}`),
		);
		if (!picked) return;
		providerId = ordered.find((provider) => picked.endsWith(provider.id))?.id;
		if (!providerId) return;
	}
	const target = oauthProviders.find((provider) => provider.id.toLowerCase() === providerId?.toLowerCase());
	if (!target) {
		ctx.ui.notify(`Unknown subscription provider: ${rawId}. Try /providers login codex.`, "error");
		return;
	}
	const abort = new AbortController();
	try {
		await runtime.login(target.id, "oauth", {
			prompt: async (prompt: AuthPrompt) => {
				if (prompt.type === "select") {
					const picked = await ctx.ui.select(prompt.message, prompt.options.map((option) => option.label));
					const found = prompt.options.find((option) => option.label === picked);
					if (!found) throw new Error("Login cancelled.");
					return found.id;
				}
				const value = await ctx.ui.input(prompt.message, prompt.placeholder);
				if (!value) throw new Error("Login cancelled.");
				return value;
			},
			notify: (event: AuthEvent) => {
				if (event.type === "auth_url") {
					const opened = openUrl(event.url);
					ctx.ui.notify(
						opened
							? `Browser opened for login. Complete it there to finish.\n${event.url}`
							: `Open this URL to log in:\n${event.url}`,
						"info",
					);
				} else if (event.type === "device_code") {
					openUrl(event.verificationUri);
					ctx.ui.notify(`Visit ${event.verificationUri} and enter code: ${event.userCode}`, "info");
				} else {
					ctx.ui.notify(event.message, "info");
				}
			},
			signal: abort.signal,
		});
	} catch (error) {
		ctx.ui.notify(`Login failed: ${error instanceof Error ? error.message : String(error)}`, "error");
		return;
	}
	ctx.ui.notify(`${target.id} login complete.`, "info");
	await maybeSetSubscriptionDefault(ctx, target.id);
}

async function maybeSetSubscriptionDefault(ctx: ProviderCommandContext, providerId: string): Promise<void> {
	try {
		const available = await getAvailableModelRecords(authPath());
		const mine = available.filter((model) => model.provider === providerId);
		if (mine.length === 0) {
			ctx.ui.notify("Logged in, but no models are available for this provider yet.", "warning");
			return;
		}
		const settingsPath = resolve(agentDir(), "settings.json");
		let current: string | undefined;
		try {
			const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
				defaultProvider?: unknown;
				defaultModel?: unknown;
			};
			if (typeof settings.defaultProvider === "string" && typeof settings.defaultModel === "string") {
				current = `${settings.defaultProvider}/${settings.defaultModel}`;
			}
		} catch {
			current = undefined;
		}
		if (current && available.some((model) => `${model.provider}/${model.id}` === current)) {
			ctx.ui.notify(
				`Kept current default ${current}. Pick a ${providerId} model for this session in /researchx-model.`,
				"info",
			);
			return;
		}
		const preferred = choosePreferredModelRecord(mine) ?? mine[0]!;
		const slash = preferred ? `${preferred.provider}/${preferred.id}` : undefined;
		if (!slash) return;
		const settings = (() => {
			try {
				return JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
			} catch {
				return {};
			}
		})();
		settings.defaultProvider = preferred!.provider;
		settings.defaultModel = preferred!.id;
		writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
		ctx.ui.notify(
			`Default model set to ${slash} (GPT line on your subscription). This session still uses the old model — switch now in /researchx-model; new sessions use the default. Tip: /thinking high for high reasoning.`,
			"info",
		);
	} catch (error) {
		ctx.ui.notify(`Could not set default model: ${error instanceof Error ? error.message : String(error)}`, "warning");
	}
}
