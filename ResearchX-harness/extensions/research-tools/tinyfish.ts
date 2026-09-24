import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { loadPiWebAccessConfig } from "../../src/pi/web-access.js";

const TINYFISH_SEARCH_URL = "https://api.search.tinyfish.ai";
const REQUEST_TIMEOUT_MS = 25_000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

function resolveApiKey(): string | undefined {
	const fromEnv =
		process.env.TINYFISH_API_KEY?.trim() || process.env.tiny_fish_api?.trim() || undefined;
	if (fromEnv) return fromEnv;
	try {
		const config = loadPiWebAccessConfig();
		const stored = typeof config.tinyfishApiKey === "string" ? config.tinyfishApiKey.trim() : "";
		return stored || undefined;
	} catch {
		return undefined;
	}
}

function safeLimit(value: number | undefined): number {
	if (!Number.isFinite(value) || value === undefined) return DEFAULT_LIMIT;
	return Math.max(1, Math.min(Math.floor(value), MAX_LIMIT));
}

function formatText(value: unknown): string {
	return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export async function tinyfishSearch(params: {
	query: string;
	location?: string;
	language?: string;
	domainType?: "web" | "news" | "research_paper";
	page?: number;
	limit?: number;
}): Promise<Record<string, unknown>> {
	const query = params.query.trim();
	if (!query) throw new Error("TinyFish search requires a non-empty query.");
	const apiKey = resolveApiKey();
	if (!apiKey) {
		throw new Error(
			"TINYFISH_API_KEY is not configured. Run `researchx search set tinyfish <api-key>` or set TINYFISH_API_KEY in your shell/.env (free key at https://agent.tinyfish.ai/api-keys).",
		);
	}
	const url = new URL(TINYFISH_SEARCH_URL);
	url.search = new URLSearchParams({
		query,
		...(params.location?.trim() ? { location: params.location.trim() } : {}),
		...(params.language?.trim() ? { language: params.language.trim() } : {}),
		...(params.domainType ? { domain_type: params.domainType } : {}),
		...(params.page !== undefined ? { page: String(Math.max(0, Math.min(10, Math.floor(params.page)))) } : {}),
	}).toString();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			headers: { "X-API-Key": apiKey, accept: "application/json" },
			signal: controller.signal,
		});
		if (response.status === 401) throw new Error("TinyFish rejected the API key (401). Check TINYFISH_API_KEY.");
		if (response.status === 429) throw new Error("TinyFish rate limit exceeded (429, 30 req/min). Retry with backoff.");
		if (!response.ok) throw new Error(`TinyFish search failed: ${response.status} ${response.statusText}`);
		const payload = (await response.json()) as Record<string, unknown>;
		const results = Array.isArray(payload.results) ? payload.results : [];
		const limit = safeLimit(params.limit);
		return {
			schema: "researchx.tinyfishSearch.v1",
			query: typeof payload.query === "string" ? payload.query : query,
			totalCount: typeof payload.total_results === "number" ? payload.total_results : results.length,
			returned: Math.min(results.length, limit),
			results: results.slice(0, limit),
			provenance: {
				docs: "https://docs.tinyfish.ai/search-api/reference.md",
				endpoints: [url.toString()],
			},
		};
	} finally {
		clearTimeout(timeout);
	}
}

export function registerTinyfishTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "tinyfish_search",
		label: "TinyFish Search",
		description:
			"Free web search via TinyFish (GET https://api.search.tinyfish.ai). Use for current/latest topics when Pi web_search is unconfigured. Returns ranked titles, snippets, URLs.",
		promptSnippet: "Search the current web with tinyfish_search for latest/current topics, products, releases, pricing, benchmarks, and docs.",
		promptGuidelines: [
			"Use tinyfish_search first for current topics when web_search has no configured provider; it needs only TINYFISH_API_KEY.",
			"Preserve returned URLs and snippets as evidence; verify decisive claims against fetched primary sources.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search query." }),
			location: Type.Optional(Type.String({ description: "Country code, e.g. US. Defaults to US." })),
			language: Type.Optional(Type.String({ description: "Language code, e.g. en. Defaults to en." })),
			domainType: Type.Optional(
				Type.Union([Type.Literal("web"), Type.Literal("news"), Type.Literal("research_paper")], {
					description: "Search type. Defaults to web.",
				}),
			),
			page: Type.Optional(Type.Number({ description: "Page number starting from 0, max 10." })),
			limit: Type.Optional(Type.Number({ description: "Max results to return. Defaults to 10, max 20." })),
		}),
		async execute(_toolCallId, params) {
			const result = await tinyfishSearch(params as { query: string });
			return { content: [{ type: "text", text: formatText(result) }], details: result };
		},
	});
}

export const testableTinyfish = { resolveApiKey, tinyfishSearch };
