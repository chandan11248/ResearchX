import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveModelProviderForCommand } from "../src/model/commands.js";

function tempAuthPath(): string {
	return join(mkdtempSync(join(tmpdir(), "researchx-auth-")), "auth.json");
}

test("resolveModelProviderForCommand maps codex alias to openai-codex OAuth", async () => {
	const resolved = await resolveModelProviderForCommand(tempAuthPath(), "codex");
	assert.deepEqual(resolved, { kind: "oauth", id: "openai-codex" });
});

test("resolveModelProviderForCommand maps chatgpt alias to openai-codex OAuth", async () => {
	const resolved = await resolveModelProviderForCommand(tempAuthPath(), "ChatGPT");
	assert.deepEqual(resolved, { kind: "oauth", id: "openai-codex" });
});

test("resolveModelProviderForCommand still resolves the full openai-codex id", async () => {
	const resolved = await resolveModelProviderForCommand(tempAuthPath(), "openai-codex");
	assert.deepEqual(resolved, { kind: "oauth", id: "openai-codex" });
});

test("resolveModelProviderForCommand returns undefined for unknown providers", async () => {
	const resolved = await resolveModelProviderForCommand(tempAuthPath(), "not-a-provider");
	assert.equal(resolved, undefined);
});
