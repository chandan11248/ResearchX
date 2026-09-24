import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Central settings home for model context windows (`researchx model context`).
 * Resolution order at runtime: models.json `modelOverrides` entry, then the
 * custom-providers.json declaration, then the ResearchX 1M default (custom
 * providers) or the provider catalog value.
 */

/** Default context window for ResearchX custom providers (1M tokens). */
export const DEFAULT_CONTEXT_WINDOW = 1_000_000;
export const MIN_CONTEXT_WINDOW = 1_000;
export const MAX_CONTEXT_WINDOW = 100_000_000;

export type CustomProviderModel = {
	id: string;
	name?: string;
	reasoning?: boolean;
	contextWindow?: number;
	maxTokens?: number;
};

export type CustomProviderEntry = {
	id: string;
	name?: string;
	api?: string;
	baseUrl: string;
	apiKey?: string;
	models?: CustomProviderModel[];
};

export type CustomProvidersFile = {
	providers?: CustomProviderEntry[];
	defaultModel?: string;
};

export function customProvidersPath(): string {
	const home = process.env.RESEARCHX_HOME?.trim() || join(homedir(), ".researchx");
	return resolve(home, "custom-providers.json");
}

function agentDir(): string {
	const configured = process.env.PI_CODING_AGENT_DIR ?? process.env.RESEARCHX_CODING_AGENT_DIR;
	if (configured?.trim()) return resolve(configured.trim());
	return resolve(homedir(), ".researchx", "agent");
}

function modelsJsonPath(): string {
	return resolve(agentDir(), "models.json");
}

/** Parse user input like `512K`, `1M`, or `2000000` into a token count. */
export function parseContextValue(raw: string | undefined): number | undefined {
	if (raw === undefined) return undefined;
	const normalized = raw.trim().toLowerCase().replace(/,/g, "");
	if (!normalized) return undefined;
	const multiplier = normalized.endsWith("m") ? 1_000_000 : normalized.endsWith("k") ? 1_000 : 1;
	const numeric = Number(multiplier === 1 ? normalized : normalized.slice(0, -1));
	if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
	const value = Math.floor(numeric * multiplier);
	if (value < MIN_CONTEXT_WINDOW || value > MAX_CONTEXT_WINDOW) return undefined;
	return value;
}

export function formatContextTokens(value: number | undefined): string {
	if (value === undefined) return "unknown";
	if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`;
	if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}K`;
	return String(value);
}

/** Read the file-backed custom provider config (no .env fallback). */
export function readCustomProvidersFile(): { file: CustomProvidersFile; path: string; error?: string } {
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

/** Persist the file-backed custom provider config. Returns false on write failure. */
export function saveCustomProvidersFile(file: CustomProvidersFile, path: string): boolean {
	try {
		writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
		return true;
	} catch {
		return false;
	}
}

type PersistedProviderRecord = Record<string, unknown> & {
	providers?: Record<string, Record<string, unknown>>;
};

export type PersistedModelEntry = {
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
 * elsewhere survive a relaunch. File-declared fields win; otherwise existing
 * values win; the ResearchX 1M default fills a missing contextWindow.
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
	const path = modelsJsonPath();
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
		writeFileSync(modelsJsonPath(), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
		return true;
	} catch {
		return false;
	}
}

function providerRecords(parsed: PersistedProviderRecord): Record<string, Record<string, unknown>> {
	return {
		...(parsed.providers && typeof parsed.providers === "object" ? parsed.providers : {}),
	};
}

export function persistCustomProvidersModelsJson(file: CustomProvidersFile): void {
	const entries = (file.providers ?? []).filter((entry) => entry?.id && entry?.baseUrl);
	if (entries.length === 0) return;
	const parsed = readModelsJson();
	// Leave an unreadable models.json alone rather than clobbering it.
	if (!parsed) return;
	const providers = providerRecords(parsed);
	for (const entry of entries) {
		const existingProvider =
			typeof providers[entry.id] === "object" && providers[entry.id] ? { ...providers[entry.id]! } : {};
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

/**
 * Set a per-model context-window override in Pi auth storage (`modelOverrides`
 * in `<agent-dir>/models.json`). Works for any provider without touching
 * endpoints or keys. Survives relaunch because the custom-provider sync
 * preserves unknown provider fields.
 */
export function setModelContextOverride(providerId: string, modelId: string, contextWindow: number): boolean {
	const parsed = readModelsJson();
	if (!parsed) return false;
	const providers = providerRecords(parsed);
	const existing =
		typeof providers[providerId] === "object" && providers[providerId] ? { ...providers[providerId]! } : {};
	const overrides: Record<string, unknown> =
		existing.modelOverrides && typeof existing.modelOverrides === "object"
			? { ...(existing.modelOverrides as Record<string, unknown>) }
			: {};
	const prev =
		overrides[modelId] && typeof overrides[modelId] === "object"
			? { ...(overrides[modelId] as Record<string, unknown>) }
			: {};
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

export type ContextWindowWriteResult = {
	/** models.json override written. */
	overrideWritten: boolean;
	/** custom-providers.json updated (model is file-defined). */
	fileUpdated: boolean;
	filePath?: string;
};

/**
 * Central setter used by every settings surface. Writes the models.json
 * override always; additionally writes through to custom-providers.json when
 * the model is file-defined so extension re-registration keeps the value.
 */
export function setProviderModelContextWindow(
	providerId: string,
	modelId: string,
	contextWindow: number,
): ContextWindowWriteResult {
	const result: ContextWindowWriteResult = { overrideWritten: false, fileUpdated: false };
	const { file, path } = readCustomProvidersFile();
	const hasFileConfig = (file.providers ?? []).length > 0 || !!file.defaultModel;
	const entry = hasFileConfig ? (file.providers ?? []).find((candidate) => candidate.id === providerId) : undefined;
	const fileModel = entry?.models?.find((model) => model.id === modelId);
	if (fileModel && entry) {
		fileModel.contextWindow = contextWindow;
		if (saveCustomProvidersFile(file, path)) {
			persistCustomProvidersModelsJson(file);
			result.fileUpdated = true;
			result.filePath = path;
		}
	}
	result.overrideWritten = setModelContextOverride(providerId, modelId, contextWindow);
	return result;
}
