import assert from "node:assert/strict";
import test from "node:test";

import { resolveSubscriptionProviderId } from "../extensions/research-tools/custom-providers.js";

test("resolveSubscriptionProviderId maps codex alias to openai-codex", () => {
	assert.equal(resolveSubscriptionProviderId("codex"), "openai-codex");
});

test("resolveSubscriptionProviderId maps chatgpt alias case-insensitively", () => {
	assert.equal(resolveSubscriptionProviderId("ChatGPT"), "openai-codex");
});

test("resolveSubscriptionProviderId passes full provider ids through", () => {
	assert.equal(resolveSubscriptionProviderId("openai-codex"), "openai-codex");
});

test("resolveSubscriptionProviderId returns undefined for empty input", () => {
	assert.equal(resolveSubscriptionProviderId(undefined), undefined);
	assert.equal(resolveSubscriptionProviderId("  "), undefined);
});
