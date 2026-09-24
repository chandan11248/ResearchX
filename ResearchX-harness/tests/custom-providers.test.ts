import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
	customProvidersPath,
	installCustomProviders,
	providerFromDotEnv,
} from "../extensions/research-tools/custom-providers.js";

function makeCtx(providers: Map<string, unknown>, cwd: string, model?: { provider: string; id: string }) {
	const notified: Array<{ message: string; level: string }> = [];
	return {
		notified,
		cwd,
		model,
		modelRegistry: {
			registerProvider: (id: string, config: unknown) => {
				providers.set(id, config);
			},
			find: (providerId: string, modelId: string) => {
				const config = providers.get(providerId) as
					| { models?: Array<{ id: string }> }
					| undefined;
				if (!config?.models?.some((entry) => entry.id === modelId)) return undefined;
				return { provider: providerId, id: modelId };
			},
			hasConfiguredAuth: () => true,
		},
		ui: {
			notify: (message: string, level = "info") => {
				notified.push({ message, level });
			},
		},
	};
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
	const saved: Record<string, string | undefined> = {};
	for (const key of Object.keys(vars)) {
		saved[key] = process.env[key];
		const value = vars[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		fn();
	} finally {
		for (const key of Object.keys(vars)) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
	}
}

test("file config registers providers and persists the default", async () => {
	const home = mkdtempSync(join(tmpdir(), "rx-providers-"));
	const agentDir = join(home, "agent");
	mkdirSync(agentDir, { recursive: true });
	writeFileSync(
		join(home, "custom-providers.json"),
		JSON.stringify({
			providers: [
				{
					id: "zen",
					name: "OpenCode Zen",
					api: "openai-completions",
					baseUrl: "https://opencode.ai/zen/v1",
					apiKey: "sk-test",
					models: [{ id: "ling-3.0-flash-fin-free", name: "Ling" }],
				},
			],
			defaultModel: "zen/ling-3.0-flash-fin-free",
		}),
		"utf8",
	);
	const providers = new Map<string, unknown>();
	const ctx = makeCtx(providers, home);
	const savedHome = process.env.RESEARCHX_HOME;
	const savedAgent = process.env.PI_CODING_AGENT_DIR;
	process.env.RESEARCHX_HOME = home;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	try {
		assert.equal(customProvidersPath(), join(home, "custom-providers.json"));
		const registered = await installCustomProviders({} as never, ctx as never);
		assert.deepEqual(registered, ["zen"]);
		const stored = providers.get("zen") as { baseUrl: string; models: Array<{ id: string; name: string }> };
		assert.equal(stored.baseUrl, "https://opencode.ai/zen/v1");
		assert.equal(stored.models[0]?.id, "ling-3.0-flash-fin-free");
		const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")) as Record<string, unknown>;
		assert.equal(settings.defaultProvider, "zen");
		assert.equal(settings.defaultModel, "ling-3.0-flash-fin-free");
		const modelsJson = JSON.parse(readFileSync(join(agentDir, "models.json"), "utf8")) as {
			providers?: Record<string, { baseUrl?: string; apiKey?: string; models?: Array<{ id: string }> }>;
		};
		assert.equal(modelsJson.providers?.zen?.baseUrl, "https://opencode.ai/zen/v1");
		assert.equal(modelsJson.providers?.zen?.apiKey, "sk-test");
		assert.equal(modelsJson.providers?.zen?.models?.[0]?.id, "ling-3.0-flash-fin-free");
	} finally {
		withEnv({ RESEARCHX_HOME: savedHome, PI_CODING_AGENT_DIR: savedAgent }, () => undefined);
	}
});

test("project .env is the dev fallback when no config file exists", async () => {
	const home = mkdtempSync(join(tmpdir(), "rx-providers-envhome-"));
	const cwd = mkdtempSync(join(tmpdir(), "rx-providers-envcwd-"));
	const agentDir = join(home, "agent");
	mkdirSync(agentDir, { recursive: true });
	writeFileSync(
		join(cwd, ".env"),
		"base_url=https://opencode.ai/zen/v1\nopencode_api=sk-test\nmodel=ling-3.0-flash-fin-free\n",
		"utf8",
	);
	const file = providerFromDotEnv(cwd);
	assert.equal(file.providers?.[0]?.id, "zen");
	assert.equal(file.defaultModel, "zen/ling-3.0-flash-fin-free");

	const providers = new Map<string, unknown>();
	const ctx = makeCtx(providers, cwd);
	const savedHome = process.env.RESEARCHX_HOME;
	const savedAgent = process.env.PI_CODING_AGENT_DIR;
	process.env.RESEARCHX_HOME = home;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	try {
		const registered = await installCustomProviders({} as never, ctx as never);
		assert.deepEqual(registered, ["zen"]);
		const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")) as Record<string, unknown>;
		assert.equal(settings.defaultProvider, "zen");
	} finally {
		withEnv({ RESEARCHX_HOME: savedHome, PI_CODING_AGENT_DIR: savedAgent }, () => undefined);
	}
});

test("unauthenticated current model triggers a guidance nudge, not silence", async () => {
	const home = mkdtempSync(join(tmpdir(), "rx-providers-nudge-"));
	const providers = new Map<string, unknown>();
	const ctx = makeCtx(providers, home, { provider: "anthropic", id: "claude-opus-5" });
	(ctx.modelRegistry as { hasConfiguredAuth: () => boolean }).hasConfiguredAuth = () => false;
	const savedHome = process.env.RESEARCHX_HOME;
	process.env.RESEARCHX_HOME = home;
	try {
		await installCustomProviders({} as never, ctx as never);
		assert.match(ctx.notified.map((entry) => entry.message).join("\n"), /no working key/);
	} finally {
		withEnv({ RESEARCHX_HOME: savedHome }, () => undefined);
	}
});

test("missing config and empty env registers nothing and warns nothing", async () => {
	const home = mkdtempSync(join(tmpdir(), "rx-providers-empty-"));
	const cwd = mkdtempSync(join(tmpdir(), "rx-providers-emptycwd-"));
	const providers = new Map<string, unknown>();
	const ctx = makeCtx(providers, cwd);
	const savedHome = process.env.RESEARCHX_HOME;
	process.env.RESEARCHX_HOME = home;
	try {
		const registered = await installCustomProviders({} as never, ctx as never);
		assert.deepEqual(registered, []);
		assert.deepEqual(ctx.notified, []);
	} finally {
		withEnv({ RESEARCHX_HOME: savedHome }, () => undefined);
	}
});

test("researchx theme exists and uses a blue accent", () => {
	const theme = JSON.parse(
		readFileSync(new URL("../.researchx/themes/researchx.json", import.meta.url), "utf8"),
	) as {
		name: string;
		colors: Record<string, string>;
		vars: Record<string, string>;
		export: Record<string, string>;
	};
	assert.equal(theme.name, "researchx");
	assert.equal(theme.colors.accent, "azure");
	assert.equal(theme.colors.borderAccent, "azure");
	assert.equal(theme.colors.text, "iris");
	assert.equal(theme.colors.inputText, "iris");
	assert.equal(theme.colors.dim, "iris");
	assert.equal(theme.colors.muted, "iris");
	assert.match(theme.vars.azure ?? "", /^#[0-9a-f]{6}$/i);
	assert.equal(theme.vars.iris, "#aa8ba9");
	assert.equal(theme.vars.selection, "#1d3557");
	assert.equal(theme.vars.azure, "#6d8fc4");
	assert.equal(theme.export.pageBg, "#070b16");
	assert.equal(theme.export.cardBg, "#0c1323");
	assert.equal(theme.export.infoBg, "#182538");
	assert.doesNotMatch(JSON.stringify(theme), /#2d353b|#343f44|#374247/);
});
