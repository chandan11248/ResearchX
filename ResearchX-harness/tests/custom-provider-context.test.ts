import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
	DEFAULT_CONTEXT_WINDOW,
	formatContextTokens,
	getModelContextOverride,
	mergePersistedModels,
	parseContextValue,
	persistCustomProvidersModelsJson,
	setModelContextOverride,
} from "../src/model/context-window.js";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalRxAgentDir = process.env.RESEARCHX_CODING_AGENT_DIR;
const originalHome = process.env.RESEARCHX_HOME;

function useTempAgentDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "researchx-agent-"));
	process.env.PI_CODING_AGENT_DIR = dir;
	delete process.env.RESEARCHX_CODING_AGENT_DIR;
	return dir;
}

afterEach(() => {
	process.env.PI_CODING_AGENT_DIR = originalAgentDir;
	process.env.RESEARCHX_CODING_AGENT_DIR = originalRxAgentDir;
	process.env.RESEARCHX_HOME = originalHome;
});

test("custom providers default to a 1M context window", () => {
	assert.equal(DEFAULT_CONTEXT_WINDOW, 1_000_000);
});

test("merge prefers file values and keeps disk values without stamping defaults", () => {
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
		{ id: "fresh" },
	]);
});

test("persist preserves modelOverrides and sibling fields", () => {
	const dir = useTempAgentDir();
	writeFileSync(
		join(dir, "models.json"),
		JSON.stringify({
			providers: {
				p: {
					baseUrl: "https://x/v1",
					models: [{ id: "m" }],
					modelOverrides: { m: { contextWindow: 2_000_000 } },
				},
			},
		}),
		"utf8",
	);
	persistCustomProvidersModelsJson({
		providers: [{ id: "p", baseUrl: "https://x/v1", models: [{ id: "m" }] }],
	});
	assert.equal(getModelContextOverride("p", "m"), 2_000_000);
	const parsed = JSON.parse(readFileSync(join(dir, "models.json"), "utf8")) as Record<string, unknown>;
	const provider = (parsed.providers as Record<string, Record<string, unknown>>).p!;
	assert.equal(provider.baseUrl, "https://x/v1");
});

test("override writer round-trips a single model entry", () => {
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

test("parseContextValue accepts K/M suffixes and plain numbers", () => {
	assert.equal(parseContextValue("512K"), 512_000);
	assert.equal(parseContextValue("1M"), 1_000_000);
	assert.equal(parseContextValue("2000000"), 2_000_000);
	assert.equal(parseContextValue(" 128k "), 128_000);
	assert.equal(parseContextValue(""), undefined);
	assert.equal(parseContextValue("abc"), undefined);
	assert.equal(parseContextValue("999"), undefined);
	assert.equal(parseContextValue("500M"), undefined);
});

test("formatContextTokens shortens exact K/M values", () => {
	assert.equal(formatContextTokens(1_000_000), "1M");
	assert.equal(formatContextTokens(512_000), "512K");
	assert.equal(formatContextTokens(1500), "1500");
	assert.equal(formatContextTokens(undefined), "unknown");
});
