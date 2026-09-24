import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { registerTinyfishTools } from "../extensions/research-tools/tinyfish.js";

type Tool = {
	name: string;
	execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; details: unknown }>;
};

const originalFetch = globalThis.fetch;
const originalKey = process.env.TINYFISH_API_KEY;
const originalLegacyKey = process.env.tiny_fish_api;

afterEach(() => {
	globalThis.fetch = originalFetch;
	process.env.TINYFISH_API_KEY = originalKey;
	process.env.tiny_fish_api = originalLegacyKey;
});

function registerTools(): Map<string, Tool> {
	const tools = new Map<string, Tool>();
	registerTinyfishTools({
		registerTool(tool: Tool) {
			tools.set(tool.name, tool);
		},
	} as never);
	return tools;
}

test("tinyfish_search sends X-API-Key and returns bounded results with provenance", async () => {
	process.env.TINYFISH_API_KEY = "tf_test";
	delete process.env.tiny_fish_api;
	const requests: Array<{ url: string; apiKey?: string }> = [];
	globalThis.fetch = async (input, init) => {
		const url = String(input);
		const headers = init?.headers as Record<string, string> | undefined;
		requests.push({ url, apiKey: headers?.["X-API-Key"] });
		return new Response(
			JSON.stringify({
				query: "test",
				total_results: 2,
				page: 0,
				results: [
					{ position: 1, title: "A", snippet: "s", url: "https://a.example" },
					{ position: 2, title: "B", snippet: "s", url: "https://b.example" },
				],
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	};

	const tools = registerTools();
	const result = await tools.get("tinyfish_search")?.execute("call-1", { query: "test", limit: 1 });
	const details = result?.details as Record<string, unknown>;
	assert.equal(requests[0]?.apiKey, "tf_test");
	assert.match(requests[0]?.url ?? "", /api\.search\.tinyfish\.ai/);
	assert.equal(details.returned, 1);
	assert.equal((details.results as unknown[]).length, 1);
	assert.match(JSON.stringify(details.provenance), /tinyfish/);
});

test("tinyfish_search errors clearly when no key is configured", async () => {
	delete process.env.TINYFISH_API_KEY;
	delete process.env.tiny_fish_api;
	const tools = registerTools();
	const tool = tools.get("tinyfish_search");
	assert.ok(tool);
	await assert.rejects(() => tool.execute("call-1", { query: "test" }), /TINYFISH_API_KEY/);
});
