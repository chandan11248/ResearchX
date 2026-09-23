import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	fullSlug,
	isTerminalState,
	KAGGLE_POLL_MINUTES_DEFAULT,
	parseKernelStatus,
	resolveKaggleAuth,
	writeKernelMetadata,
} from "../extensions/research-tools/kaggle.js";

test("parseKernelStatus normalizes CLI output", () => {
	assert.equal(parseKernelStatus("parth11248/diffusion-exp : complete"), "complete");
	assert.equal(parseKernelStatus("status: RUNNING"), "running");
	assert.equal(parseKernelStatus("queued"), "queued");
	assert.equal(parseKernelStatus("ERROR: quota exceeded"), "error");
	assert.equal(parseKernelStatus("cancelled by user"), "cancelled");
	assert.equal(parseKernelStatus("some unexpected text"), "unknown");
	assert.equal(isTerminalState("complete"), true);
	assert.equal(isTerminalState("error"), true);
	assert.equal(isTerminalState("running"), false);
	assert.equal(KAGGLE_POLL_MINUTES_DEFAULT, 10);
});

test("fullSlug prefixes bare slugs with the username", () => {
	assert.equal(fullSlug("my-exp", "parth11248"), "parth11248/my-exp");
	assert.equal(fullSlug("parth11248/my-exp", "other"), "parth11248/my-exp");
});

test("resolveKaggleAuth prefers env over the token file", () => {
	const withEnv = resolveKaggleAuth({ KAGGLE_USERNAME: "u", KAGGLE_KEY: "k" } as NodeJS.ProcessEnv);
	assert.deepEqual(withEnv, { username: "u", key: "k", source: "env" });
});

test("resolveKaggleAuth reports setup steps when nothing is configured", () => {
	const previousHome = process.env.HOME;
	const emptyHome = mkdtempSync(join(tmpdir(), "rx-kaggle-nohome-"));
	process.env.HOME = emptyHome;
	try {
		const missing = resolveKaggleAuth({} as NodeJS.ProcessEnv);
		assert.ok("error" in missing);
	} finally {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
	}
});

test("writeKernelMetadata creates a GPU script kernel manifest", () => {
	const dir = mkdtempSync(join(tmpdir(), "rx-kaggle-meta-"));
	writeFileSync(join(dir, "train.py"), "print('hi')\n", "utf8");
	const slug = writeKernelMetadata(dir, { owner: "parth11248", title: "Diffusion Test", codeFile: "train.py", gpu: true });
	assert.equal(slug, "parth11248/diffusion-test");
	const metadata = JSON.parse(readFileSync(join(dir, "kernel-metadata.json"), "utf8")) as Record<string, unknown>;
	assert.equal(metadata.kernel_type, "script");
	assert.equal(metadata.enable_gpu, true);
	assert.equal(metadata.code_file, "train.py");
});
