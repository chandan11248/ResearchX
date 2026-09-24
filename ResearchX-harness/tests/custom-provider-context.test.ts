import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
	DEFAULT_CONTEXT_WINDOW,
	getModelContextOverride,
	mergePersistedModels,
	setModelContextOverride,
} from "../extensions/research-tools/custom-providers.js";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalRxAgentDir = process.env.RESEARCHX_CODING_AGENT_DIR;

function useTempAgentDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "researchx-agent-"));
	process.env.PI_CODING_AGENT_DIR = dir;
	delete process.env.RESEARCHX_CODING_AGENT_DIR;
	return dir;
}

afterEach(() => {
	process.env.PI_CODING_AGENT_DIR = originalAgentDir;
	process.env.RESEARCHX_CODING_AGENT_DIR = originalRxAgentDir;
});

test("custom providers default to a 1M context window", () => {
	assert.equal(DEFAULT_CONTEXT_WINDOW, 1_000_000);
	assert.deepEqual(
		mergePersistedModels([], [{ id: "m" }]),
		[{ id: "m", contextWindow: 1_000_000 }],
	);
});

test("merge prefers file values, keeps disk values, fills the 1M default", () => {
	const merged = mergePersistedModels(
		[
			{ id: "keep", contextWindow: 200_000, maxTokens: 4000 },
			{ id: "override", contextWindow: 300_000 },
		],
		[
			{ id: "keep" },
			{ id: "override", contextWindow: 500_000 },
			{ id: "fresh" },
		],
	);
	assert.deepEqual(merged, [
		{ id: "keep", contextWindow: 200_000, maxTokens: 4000 },
		{ id: "override", contextWindow: 500_000 },
		{ id: "fresh", contextWindow: 1_000_000 },
	]);
});

test("context override round-trips through models.json without touching siblings", () => {
	const dir = useTempAgentDir();
	writeFileSync(
		join(dir, "models.json"),
		JSON.stringify({ providers: { p: { baseUrl: "https://x/v1", models: [{ id: "m" }] } } }),
		"utf8",
	);
	assert.equal(setModelContextOverride("p", "m", 2_000_000), true);
	assert.equal(getModelContextOverride("p", "m"), 2_000_000);
	const parsed = JSON.parse(readFileSync(join(dir, "models.json"), "utf8")) as Record<string, unknown>;
	const provider = (parsed.providers as Record<string, Record<string, unknown>>).p!;
	assert.equal(provider.baseUrl, "https://x/v1");
	assert.deepEqual(provider.models, [{ id: "m" }]);
});

test("context override creates models.json when missing", () => {
	useTempAgentDir();
	assert.equal(setModelContextOverride("p", "m", 512_000), true);
	assert.equal(getModelContextOverride("p", "m"), 512_000);
});
