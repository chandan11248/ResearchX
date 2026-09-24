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
	setModelContextOverride,
	setProviderModelContextWindow,
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

test("central setter writes file-through for file-defined models", () => {
	const agentDir = useTempAgentDir();
	const home = mkdtempSync(join(tmpdir(), "researchx-home-"));
	process.env.RESEARCHX_HOME = home;
	const providersPath = join(home, "custom-providers.json");
	writeFileSync(
		providersPath,
		JSON.stringify({
			providers: [{ id: "env", baseUrl: "https://x/v1", models: [{ id: "m" }] }],
		}),
		"utf8",
	);
	const result = setProviderModelContextWindow("env", "m", 2_000_000);
	assert.equal(result.overrideWritten, true);
	assert.equal(result.fileUpdated, true);
	assert.equal(result.filePath, providersPath);
	assert.equal(getModelContextOverride("env", "m"), 2_000_000);
	const file = JSON.parse(readFileSync(providersPath, "utf8")) as {
		providers: Array<{ models: Array<{ id: string; contextWindow?: number }> }>;
	};
	assert.equal(file.providers[0]!.models[0]!.contextWindow, 2_000_000);
	const modelsJson = JSON.parse(readFileSync(join(agentDir, "models.json"), "utf8")) as {
		providers: Record<string, { models: Array<{ id: string; contextWindow?: number }> }>;
	};
	assert.equal(modelsJson.providers.env!.models[0]!.contextWindow, 2_000_000);
});

test("central setter writes override-only for non-file models", () => {
	useTempAgentDir();
	const home = mkdtempSync(join(tmpdir(), "researchx-home-"));
	process.env.RESEARCHX_HOME = home;
	const result = setProviderModelContextWindow("openai-codex", "gpt-5.5", 512_000);
	assert.equal(result.overrideWritten, true);
	assert.equal(result.fileUpdated, false);
	assert.equal(getModelContextOverride("openai-codex", "gpt-5.5"), 512_000);
});
