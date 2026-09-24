import assert from "node:assert/strict";
import test from "node:test";

import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

import { formatOpenCodeProviderError, isOpenCodeFreeTierPolicyError } from "../src/model/opencode.js";

test("bundled Pi catalogs use the official OpenCode Zen and Go endpoints", () => {
	const zen = getBuiltinModels("opencode").find((model) => model.id === "gpt-5.5");
	assert.deepEqual(
		zen && { api: zen.api, baseUrl: zen.baseUrl },
		{ api: "openai-responses", baseUrl: "https://opencode.ai/zen/v1" },
	);

	const go = getBuiltinModels("opencode-go").find((model) => model.id === "kimi-k2.6");
	assert.deepEqual(
		go && { api: go.api, baseUrl: go.baseUrl },
		{ api: "openai-completions", baseUrl: "https://opencode.ai/zen/go/v1" },
	);
});

test("OpenCode free-tier 403s produce policy guidance without bypass advice", () => {
	const error = "403 FreeTierError: OpenCode's free tier can only be used from within OpenCode.";

	assert.equal(isOpenCodeFreeTierPolicyError(error), true);
	assert.match(formatOpenCodeProviderError(error), /upstream/);
	assert.match(formatOpenCodeProviderError(error), /paid\/authorized OpenCode Zen or OpenCode Go API key/);
	assert.match(formatOpenCodeProviderError(error), /cannot be fixed by changing headers or app identity/);
	assert.equal(isOpenCodeFreeTierPolicyError("403 invalid API key"), false);
});
