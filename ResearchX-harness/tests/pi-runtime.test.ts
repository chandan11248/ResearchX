import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
	applyResearchXPackageManagerEnv,
	buildPiArgs,
	buildPiEnv,
	ensureResearchXCommandShim,
	ensureResearchXWorkspaceScaffold,
	getResearchXCommandShimDir,
	getResearchXNpmGlobalNodeModulesPath,
	resolvePiPaths,
	toNodeImportSpecifier,
	validatePiInstallation,
} from "../src/pi/runtime.js";
import { resolveBundledAlphaCliPath } from "../src/cli.js";
import {
	assertPiCliArgsPatchSource,
	patchPiCliArgsSource,
} from "../scripts/lib/pi-cli-args-patch.mjs";

test("getResearchXNpmGlobalNodeModulesPath follows npm prefix layout on each platform", () => {
	const agentDir = join("home", ".researchx", "agent");
	assert.equal(
		getResearchXNpmGlobalNodeModulesPath(agentDir, "linux"),
		resolve("home", ".researchx", "npm-global", "lib", "node_modules"),
	);
	assert.equal(
		getResearchXNpmGlobalNodeModulesPath(agentDir, "darwin"),
		resolve("home", ".researchx", "npm-global", "lib", "node_modules"),
	);
	assert.equal(
		getResearchXNpmGlobalNodeModulesPath(agentDir, "win32"),
		resolve("home", ".researchx", "npm-global", "node_modules"),
	);
});

test("buildPiArgs includes configured runtime paths and prompt", () => {
	const args = buildPiArgs({
		appRoot: "/repo/ResearchX-harness",
		workingDir: "/workspace",
		sessionDir: "/sessions",
		researchxAgentDir: "/home/.researchx/agent",
		mode: "rpc",
		initialPrompt: "hello",
		explicitModelSpec: "openai:gpt-test",
		thinkingLevel: "medium",
	});

	assert.deepEqual(args, [
		"--session-dir",
		"/sessions",
		"--extension",
		"/repo/ResearchX-harness/extensions/research-tools.ts",
		"--prompt-template",
		"/repo/ResearchX-harness/prompts",
		"--mode",
		"rpc",
		"--model",
		"openai:gpt-test",
		"--thinking",
		"medium",
		"--",
		"hello",
	]);
});

test("buildPiArgs places the delimiter after all options for dash-leading prompts", () => {
	const oneShotArgs = buildPiArgs({
		appRoot: "/repo/ResearchX-harness",
		workingDir: "/workspace",
		sessionDir: "/sessions",
		researchxAgentDir: "/home/.researchx/agent",
		mode: "text",
		explicitModelSpec: "openai:gpt-test",
		oneShotPrompt: "--answer briefly",
	});
	assert.deepEqual(oneShotArgs.slice(-5), [
		"--model",
		"openai:gpt-test",
		"-p",
		"--",
		"--answer briefly",
	]);
	assert.ok(oneShotArgs.indexOf("--model") < oneShotArgs.indexOf("--"));

	const initialArgs = buildPiArgs({
		appRoot: "/repo/ResearchX-harness",
		workingDir: "/workspace",
		sessionDir: "/sessions",
		researchxAgentDir: "/home/.researchx/agent",
		mode: "rpc",
		initialPrompt: "- summarize these results",
	});
	assert.deepEqual(initialArgs.slice(-2), ["--", "- summarize these results"]);
	assert.ok(initialArgs.indexOf("--mode") < initialArgs.indexOf("--"));
});

test("Pi CLI end-of-options patch matches 0.84.2 and is idempotent", () => {
	const source = readFileSync(
		join(
			process.cwd(),
			"node_modules",
			"@earendil-works",
			"pi-coding-agent",
			"dist",
			"cli",
			"args.js",
		),
		"utf8",
	);
	const patched = patchPiCliArgsSource(source);
	assertPiCliArgsPatchSource(patched);
	assert.equal(patchPiCliArgsSource(patched), patched);
	assert.ok(
		patched.indexOf('if (arg === "--") {') <
			patched.indexOf('else if (arg === "--help" || arg === "-h") {'),
	);
});

test("buildPiArgs omits thinking arg when launch thinking is not explicit", () => {
	const args = buildPiArgs({
		appRoot: "/repo/ResearchX-harness",
		workingDir: "/workspace",
		sessionDir: "/sessions",
		researchxAgentDir: "/home/.researchx/agent",
		mode: "rpc",
		initialPrompt: "hello",
	});

	assert.equal(args.includes("--thinking"), false);
});

test("buildPiArgs passes --continue when resuming the recent persisted session", () => {
	const args = buildPiArgs({
		appRoot: "/repo/ResearchX-harness",
		workingDir: "/workspace",
		sessionDir: "/sessions",
		researchxAgentDir: "/home/.researchx/agent",
		mode: "text",
		resumeRecentSession: true,
	});

	assert.ok(args.includes("--continue"));
	assert.equal(args.includes("--new-session"), false);
	assert.equal(args.includes("--"), false);
});

test("buildPiArgs defaults interactive launches to the fullscreen scrollable TUI", () => {
	const args = buildPiArgs({
		appRoot: "/repo/ResearchX-harness",
		workingDir: "/workspace",
		sessionDir: "/sessions",
		researchxAgentDir: "/home/.researchx/agent",
	});

	const tuiModeIndex = args.indexOf("--tui-mode");
	assert.notEqual(tuiModeIndex, -1);
	assert.equal(args[tuiModeIndex + 1], "fullscreen");
});

test("buildPiArgs honors the RESEARCHX_TUI_MODE=regular escape hatch", () => {
	process.env.RESEARCHX_TUI_MODE = "regular";
	try {
		const args = buildPiArgs({
			appRoot: "/repo/ResearchX-harness",
			workingDir: "/workspace",
			sessionDir: "/sessions",
			researchxAgentDir: "/home/.researchx/agent",
		});

		const tuiModeIndex = args.indexOf("--tui-mode");
		assert.notEqual(tuiModeIndex, -1);
		assert.equal(args[tuiModeIndex + 1], "regular");
	} finally {
		delete process.env.RESEARCHX_TUI_MODE;
	}
});

test("buildPiArgs omits --tui-mode for one-shot, rpc, and json launches", () => {
	const cases: Array<Partial<Parameters<typeof buildPiArgs>[0]>> = [
		{ mode: "rpc" },
		{ mode: "json" },
		{ oneShotPrompt: "hello" },
		{ initialPrompt: "hello" },
	];
	for (const extra of cases) {
		const args = buildPiArgs({
			appRoot: "/repo/ResearchX-harness",
			workingDir: "/workspace",
			sessionDir: "/sessions",
			researchxAgentDir: "/home/.researchx/agent",
			...extra,
		});

		assert.equal(args.includes("--tui-mode"), false, JSON.stringify(extra));
	}
});

test("buildPiArgs passes stable session ids through to Pi", () => {
	const args = buildPiArgs({
		appRoot: "/repo/ResearchX-harness",
		workingDir: "/workspace",
		sessionDir: "/sessions",
		researchxAgentDir: "/home/.researchx/agent",
		mode: "json",
		sessionId: "researchx-workbench-scaling-laws",
		oneShotPrompt: "hello",
	});

	assert.deepEqual(args.slice(args.indexOf("--session-id"), args.indexOf("--session-id") + 2), [
		"--session-id",
		"researchx-workbench-scaling-laws",
	]);
});

test("buildPiEnv wires ResearchX paths into the Pi environment", () => {
	const previousUppercasePrefix = process.env.NPM_CONFIG_PREFIX;
	const previousLowercasePrefix = process.env.npm_config_prefix;
	const previousOtelServiceName = process.env.OTEL_SERVICE_NAME;
	const previousOtelServiceVersion = process.env.OTEL_SERVICE_VERSION;
	const previousOtelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	const previousOtelHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS;
	const previousOtelProtocol = process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
	const previousPiOtelServiceName = process.env.PI_OTEL_SERVICE_NAME;
	const previousPiOtelServiceVersion = process.env.PI_OTEL_SERVICE_VERSION;
	const previousTelemetrySetting = process.env.RESEARCHX_TELEMETRY;
	const previousTelemetryDistinctId = process.env.RESEARCHX_TELEMETRY_DISTINCT_ID;
	const previousPostHogKey = process.env.RESEARCHX_POSTHOG_KEY;
	const previousPostHogHost = process.env.RESEARCHX_POSTHOG_HOST;
	const previousPostHogProjectId = process.env.RESEARCHX_POSTHOG_PROJECT_ID;
	const previousDoNotTrack = process.env.DO_NOT_TRACK;
	const previousWebSearchConfig = process.env.RESEARCHX_WEB_SEARCH_CONFIG;
	process.env.NPM_CONFIG_PREFIX = "/tmp/global-prefix";
	process.env.npm_config_prefix = "/tmp/global-prefix-lower";
	delete process.env.OTEL_SERVICE_NAME;
	delete process.env.OTEL_SERVICE_VERSION;
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://private-collector.example/v1/traces";
	process.env.OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Bearer private-token";
	process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "grpc";
	delete process.env.PI_OTEL_SERVICE_NAME;
	delete process.env.PI_OTEL_SERVICE_VERSION;
	process.env.RESEARCHX_TELEMETRY = "1";
	process.env.RESEARCHX_TELEMETRY_DISTINCT_ID = "researchx_test";
	process.env.RESEARCHX_POSTHOG_KEY = "phc_test_explicit";
	process.env.RESEARCHX_POSTHOG_PROJECT_ID = "test-project";
	delete process.env.RESEARCHX_POSTHOG_HOST;
	delete process.env.DO_NOT_TRACK;
	process.env.RESEARCHX_WEB_SEARCH_CONFIG = "/tmp/custom-web/research-web.json";

	const env = buildPiEnv({
		appRoot: "/repo/ResearchX-harness",
		workingDir: "/workspace",
		sessionDir: "/sessions",
		researchxAgentDir: "/home/.researchx/agent",
		researchxVersion: "0.1.5",
	});

	try {
		assert.equal(env.RESEARCHX_SESSION_DIR, "/sessions");
		assert.equal(env.RESEARCHX_BIN_PATH, "/repo/ResearchX-harness/bin/researchx.js");
		assert.equal(env.RESEARCHX_PI_CLI_PATH, "/repo/ResearchX-harness/node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
		assert.equal(env.RESEARCHX_MEMORY_DIR, "/home/.researchx/memory");
		assert.equal(env.RESEARCHX_NPM_PREFIX, "/home/.researchx/npm-global");
		assert.equal(env.NPM_CONFIG_PREFIX, "/home/.researchx/npm-global");
		assert.equal(env.npm_config_prefix, "/home/.researchx/npm-global");
		assert.equal(env.RESEARCHX_CODING_AGENT_DIR, "/home/.researchx/agent");
		assert.equal(env.PI_CODING_AGENT_DIR, "/home/.researchx/agent");
		assert.equal(env.RESEARCHX_WEB_SEARCH_CONFIG, "/tmp/custom-web/research-web.json");
		assert.equal(env.RESEARCHX_POSTHOG_HOST, "https://us.i.posthog.com");
		assert.equal(env.RESEARCHX_POSTHOG_KEY, "phc_test_explicit");
		assert.equal(env.RESEARCHX_POSTHOG_PROJECT_ID, "test-project");
		assert.equal(env.OTEL_EXPORTER_OTLP_ENDPOINT, undefined);
		assert.equal(env.OTEL_EXPORTER_OTLP_HEADERS, undefined);
		assert.equal(env.OTEL_EXPORTER_OTLP_PROTOCOL, undefined);
		assert.equal(env.PI_OTEL_CAPTURE_CONTENT, "metadata_only");
		assert.equal(env.PI_OTEL_LOGS, "0");
		assert.equal(env.PI_OTEL_METRICS, "0");
		assert.equal(env.OTEL_SERVICE_NAME, "researchx-pi");
		assert.equal(env.OTEL_SERVICE_VERSION, undefined);
		assert.equal(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, "https://us.i.posthog.com/i/v0/ai/otel");
		assert.match(env.OTEL_EXPORTER_OTLP_TRACES_HEADERS ?? "", /^Authorization=Bearer phc_/);
		assert.equal(env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL, "http/protobuf");
		assert.equal(env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, "https://us.i.posthog.com/i/v1/logs");
		assert.match(env.OTEL_EXPORTER_OTLP_LOGS_HEADERS ?? "", /^Authorization=Bearer phc_/);
		assert.ok(
			env.PATH?.startsWith(
				"/home/.researchx/bin:/repo/ResearchX-harness/node_modules/.bin:/repo/ResearchX-harness/.researchx/npm/node_modules/.bin:/home/.researchx/npm-global/bin:",
			),
		);
	} finally {
		if (previousUppercasePrefix === undefined) {
			delete process.env.NPM_CONFIG_PREFIX;
		} else {
			process.env.NPM_CONFIG_PREFIX = previousUppercasePrefix;
		}
		if (previousLowercasePrefix === undefined) {
			delete process.env.npm_config_prefix;
		} else {
			process.env.npm_config_prefix = previousLowercasePrefix;
		}
		if (previousOtelServiceName === undefined) {
			delete process.env.OTEL_SERVICE_NAME;
		} else {
			process.env.OTEL_SERVICE_NAME = previousOtelServiceName;
		}
		if (previousOtelServiceVersion === undefined) {
			delete process.env.OTEL_SERVICE_VERSION;
		} else {
			process.env.OTEL_SERVICE_VERSION = previousOtelServiceVersion;
		}
		if (previousOtelEndpoint === undefined) {
			delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
		} else {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previousOtelEndpoint;
		}
		if (previousOtelHeaders === undefined) {
			delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
		} else {
			process.env.OTEL_EXPORTER_OTLP_HEADERS = previousOtelHeaders;
		}
		if (previousOtelProtocol === undefined) {
			delete process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
		} else {
			process.env.OTEL_EXPORTER_OTLP_PROTOCOL = previousOtelProtocol;
		}
		if (previousPiOtelServiceName === undefined) {
			delete process.env.PI_OTEL_SERVICE_NAME;
		} else {
			process.env.PI_OTEL_SERVICE_NAME = previousPiOtelServiceName;
		}
		if (previousPiOtelServiceVersion === undefined) {
			delete process.env.PI_OTEL_SERVICE_VERSION;
		} else {
			process.env.PI_OTEL_SERVICE_VERSION = previousPiOtelServiceVersion;
		}
		if (previousTelemetrySetting === undefined) {
			delete process.env.RESEARCHX_TELEMETRY;
		} else {
			process.env.RESEARCHX_TELEMETRY = previousTelemetrySetting;
		}
		if (previousTelemetryDistinctId === undefined) {
			delete process.env.RESEARCHX_TELEMETRY_DISTINCT_ID;
		} else {
			process.env.RESEARCHX_TELEMETRY_DISTINCT_ID = previousTelemetryDistinctId;
		}
		if (previousPostHogKey === undefined) {
			delete process.env.RESEARCHX_POSTHOG_KEY;
		} else {
			process.env.RESEARCHX_POSTHOG_KEY = previousPostHogKey;
		}
		if (previousPostHogHost === undefined) {
			delete process.env.RESEARCHX_POSTHOG_HOST;
		} else {
			process.env.RESEARCHX_POSTHOG_HOST = previousPostHogHost;
		}
		if (previousPostHogProjectId === undefined) {
			delete process.env.RESEARCHX_POSTHOG_PROJECT_ID;
		} else {
			process.env.RESEARCHX_POSTHOG_PROJECT_ID = previousPostHogProjectId;
		}
		if (previousDoNotTrack === undefined) {
			delete process.env.DO_NOT_TRACK;
		} else {
			process.env.DO_NOT_TRACK = previousDoNotTrack;
		}
		if (previousWebSearchConfig === undefined) {
			delete process.env.RESEARCHX_WEB_SEARCH_CONFIG;
		} else {
			process.env.RESEARCHX_WEB_SEARCH_CONFIG = previousWebSearchConfig;
		}
	}
});

test("buildPiEnv clears inherited telemetry collectors when ResearchX telemetry is disabled", () => {
	const savedEnv = {
		RESEARCHX_TELEMETRY: process.env.RESEARCHX_TELEMETRY,
		RESEARCHX_POSTHOG_KEY: process.env.RESEARCHX_POSTHOG_KEY,
		RESEARCHX_POSTHOG_HOST: process.env.RESEARCHX_POSTHOG_HOST,
		RESEARCHX_POSTHOG_PROJECT_ID: process.env.RESEARCHX_POSTHOG_PROJECT_ID,
		OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
		OTEL_EXPORTER_OTLP_HEADERS: process.env.OTEL_EXPORTER_OTLP_HEADERS,
		OTEL_EXPORTER_OTLP_PROTOCOL: process.env.OTEL_EXPORTER_OTLP_PROTOCOL,
		OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
		OTEL_EXPORTER_OTLP_TRACES_HEADERS: process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS,
			OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: process.env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL,
			OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
			OTEL_EXPORTER_OTLP_LOGS_HEADERS: process.env.OTEL_EXPORTER_OTLP_LOGS_HEADERS,
			OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: process.env.OTEL_EXPORTER_OTLP_LOGS_PROTOCOL,
			OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
			OTEL_EXPORTER_OTLP_METRICS_HEADERS: process.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS,
			OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: process.env.OTEL_EXPORTER_OTLP_METRICS_PROTOCOL,
			OTEL_RESOURCE_ATTRIBUTES: process.env.OTEL_RESOURCE_ATTRIBUTES,
			OTEL_TRACES_EXPORTER: process.env.OTEL_TRACES_EXPORTER,
			OTEL_LOGS_EXPORTER: process.env.OTEL_LOGS_EXPORTER,
			OTEL_METRICS_EXPORTER: process.env.OTEL_METRICS_EXPORTER,
			OTEL_LOG_LEVEL: process.env.OTEL_LOG_LEVEL,
			PI_OTEL_DISABLED: process.env.PI_OTEL_DISABLED,
			PI_OTEL_CAPTURE_CONTENT: process.env.PI_OTEL_CAPTURE_CONTENT,
			PI_OTEL_LOGS: process.env.PI_OTEL_LOGS,
			PI_OTEL_METRICS: process.env.PI_OTEL_METRICS,
			PI_OTEL_SERVICE_NAME: process.env.PI_OTEL_SERVICE_NAME,
			PI_OTEL_SERVICE_VERSION: process.env.PI_OTEL_SERVICE_VERSION,
			OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
			OTEL_SERVICE_VERSION: process.env.OTEL_SERVICE_VERSION,
		};
	process.env.RESEARCHX_TELEMETRY = "off";
	process.env.RESEARCHX_POSTHOG_KEY = "private-researchx-posthog-key";
	process.env.RESEARCHX_POSTHOG_HOST = "https://private-posthog.example";
	process.env.RESEARCHX_POSTHOG_PROJECT_ID = "private-project";
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://private-collector.example/v1/traces";
	process.env.OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Bearer private-token";
	process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "grpc";
	process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = "https://private-collector.example/v1/traces";
	process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS = "Authorization=Bearer private-trace-token";
		process.env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL = "grpc";
		process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT = "https://private-collector.example/v1/logs";
		process.env.OTEL_EXPORTER_OTLP_LOGS_HEADERS = "Authorization=Bearer private-log-token";
		process.env.OTEL_EXPORTER_OTLP_LOGS_PROTOCOL = "grpc";
		process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = "https://private-collector.example/v1/metrics";
		process.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS = "Authorization=Bearer private-metrics-token";
		process.env.OTEL_EXPORTER_OTLP_METRICS_PROTOCOL = "grpc";
		process.env.OTEL_RESOURCE_ATTRIBUTES = "private.path=%2FUsers%2Fadvaitpaliwal%2Fsecret";
		process.env.OTEL_TRACES_EXPORTER = "otlp";
		process.env.OTEL_LOGS_EXPORTER = "otlp";
		process.env.OTEL_METRICS_EXPORTER = "otlp";
		process.env.OTEL_LOG_LEVEL = "all";
		process.env.PI_OTEL_DISABLED = "1";
		process.env.PI_OTEL_CAPTURE_CONTENT = "all";
		process.env.PI_OTEL_LOGS = "1";
		process.env.PI_OTEL_METRICS = "1";
		process.env.PI_OTEL_SERVICE_NAME = "private-pi-service";
		process.env.PI_OTEL_SERVICE_VERSION = "private-pi-version";
		process.env.OTEL_SERVICE_NAME = "private-service";
		process.env.OTEL_SERVICE_VERSION = "private-version";

	try {
		const env = buildPiEnv({
			appRoot: "/repo/ResearchX-harness",
			workingDir: "/workspace",
			sessionDir: "/sessions",
			researchxAgentDir: "/home/.researchx/agent",
			researchxVersion: "0.3.4",
		});

		for (const key of [
			"RESEARCHX_POSTHOG_KEY",
			"RESEARCHX_POSTHOG_HOST",
			"RESEARCHX_POSTHOG_PROJECT_ID",
			"OTEL_EXPORTER_OTLP_ENDPOINT",
			"OTEL_EXPORTER_OTLP_HEADERS",
			"OTEL_EXPORTER_OTLP_PROTOCOL",
			"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
			"OTEL_EXPORTER_OTLP_TRACES_HEADERS",
				"OTEL_EXPORTER_OTLP_TRACES_PROTOCOL",
				"OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
				"OTEL_EXPORTER_OTLP_LOGS_HEADERS",
				"OTEL_EXPORTER_OTLP_LOGS_PROTOCOL",
				"OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
				"OTEL_EXPORTER_OTLP_METRICS_HEADERS",
				"OTEL_EXPORTER_OTLP_METRICS_PROTOCOL",
				"OTEL_RESOURCE_ATTRIBUTES",
				"OTEL_TRACES_EXPORTER",
				"OTEL_LOGS_EXPORTER",
				"OTEL_METRICS_EXPORTER",
				"OTEL_LOG_LEVEL",
				"PI_OTEL_DISABLED",
				"PI_OTEL_CAPTURE_CONTENT",
				"PI_OTEL_LOGS",
				"PI_OTEL_METRICS",
				"PI_OTEL_SERVICE_NAME",
				"PI_OTEL_SERVICE_VERSION",
				"OTEL_SERVICE_NAME",
				"OTEL_SERVICE_VERSION",
			]) {
			assert.equal(env[key], undefined, key);
		}
		assert.equal(env.RESEARCHX_TELEMETRY, "off");
	} finally {
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
});

test("ensureResearchXCommandShim creates a repo-local researchx launcher", () => {
	const appRoot = mkdtempSync(join(tmpdir(), "researchx-shim-app-"));
	const homeRoot = mkdtempSync(join(tmpdir(), "researchx-shim-home-"));
	const researchxAgentDir = join(homeRoot, "agent");
	const researchxBinPath = join(appRoot, "bin", "researchx.js");

	mkdirSync(dirname(researchxBinPath), { recursive: true });
	writeFileSync(
		researchxBinPath,
		"console.log(JSON.stringify({ argv: process.argv.slice(2), bin: process.argv[1] }));\n",
		"utf8",
	);

	const shimPath = ensureResearchXCommandShim(appRoot, researchxAgentDir);
	const result = spawnSync(shimPath, ["alpha", "status"], {
		encoding: "utf8",
		env: {
			...process.env,
			RESEARCHX_NODE_EXECUTABLE: process.execPath,
		},
	});

	assert.equal(getResearchXCommandShimDir(researchxAgentDir), join(homeRoot, "bin"));
	assert.equal(shimPath, join(homeRoot, "bin", "researchx"));
	assert.equal(result.status, 0);
	assert.deepEqual(JSON.parse(result.stdout), { argv: ["alpha", "status"], bin: researchxBinPath });
});

test("ensureResearchXWorkspaceScaffold creates default artifact directories", () => {
	const workingDir = mkdtempSync(join(tmpdir(), "researchx-workspace-scaffold-"));

	assert.equal(ensureResearchXWorkspaceScaffold(workingDir), true);

	for (const relPath of ["outputs/.plans", "outputs/.drafts", "papers", "notes"]) {
		assert.equal(existsSync(join(workingDir, relPath)), true, relPath);
	}
});

test("ensureResearchXWorkspaceScaffold does not block read-only research sessions", () => {
	const workingDir = mkdtempSync(join(tmpdir(), "researchx-workspace-readonly-"));
	const permissionError = Object.assign(new Error("read-only filesystem"), { code: "EROFS" });

	assert.equal(ensureResearchXWorkspaceScaffold(workingDir, () => {
		throw permissionError;
	}), false);
});

test("buildPiEnv uses pre-resolved executable paths when provided", () => {
	const paths = resolvePiPaths("/repo/researchx");
	const env = buildPiEnv(
		{
			appRoot: "/repo/ResearchX-harness",
			workingDir: "/workspace",
			sessionDir: "/sessions",
			researchxAgentDir: "/home/.researchx/agent",
		},
		paths,
		{
			pandoc: "/opt/test/bin/pandoc",
			mermaid: "/opt/test/bin/mmdc",
			browser: "/opt/test/bin/chrome",
		},
	);

	assert.equal(env.PANDOC_PATH, "/opt/test/bin/pandoc");
	assert.equal(env.MERMAID_CLI_PATH, "/opt/test/bin/mmdc");
	assert.equal(env.PUPPETEER_EXECUTABLE_PATH, "/opt/test/bin/chrome");
});

test("applyResearchXPackageManagerEnv pins npm globals to the ResearchX prefix", () => {
	const previousResearchXPrefix = process.env.RESEARCHX_NPM_PREFIX;
	const previousUppercasePrefix = process.env.NPM_CONFIG_PREFIX;
	const previousLowercasePrefix = process.env.npm_config_prefix;

	try {
		const prefix = applyResearchXPackageManagerEnv("/home/.researchx/agent");

		assert.equal(prefix, "/home/.researchx/npm-global");
		assert.equal(process.env.RESEARCHX_NPM_PREFIX, "/home/.researchx/npm-global");
		assert.equal(process.env.NPM_CONFIG_PREFIX, "/home/.researchx/npm-global");
		assert.equal(process.env.npm_config_prefix, "/home/.researchx/npm-global");
	} finally {
		if (previousResearchXPrefix === undefined) {
			delete process.env.RESEARCHX_NPM_PREFIX;
		} else {
			process.env.RESEARCHX_NPM_PREFIX = previousResearchXPrefix;
		}
		if (previousUppercasePrefix === undefined) {
			delete process.env.NPM_CONFIG_PREFIX;
		} else {
			process.env.NPM_CONFIG_PREFIX = previousUppercasePrefix;
		}
		if (previousLowercasePrefix === undefined) {
			delete process.env.npm_config_prefix;
		} else {
			process.env.npm_config_prefix = previousLowercasePrefix;
		}
	}
});

test("resolvePiPaths includes the Promise.withResolvers polyfill path", () => {
	const paths = resolvePiPaths("/repo/ResearchX-harness");

	assert.equal(paths.promisePolyfillPath, "/repo/ResearchX-harness/dist/system/promise-polyfill.js");
});

test("resolvePiPaths falls back to the vendored runtime workspace in packed installs", () => {
	const appRoot = mkdtempSync(join(tmpdir(), "researchx-packed-runtime-"));
	const piDist = join(appRoot, ".researchx", "npm", "node_modules", "@earendil-works", "pi-coding-agent", "dist");
	mkdirSync(piDist, { recursive: true });
	writeFileSync(join(piDist, "cli.js"), "", "utf8");
	writeFileSync(join(piDist, "main.js"), "", "utf8");
	mkdirSync(join(appRoot, "dist", "pi"), { recursive: true });
	mkdirSync(join(appRoot, "dist", "system"), { recursive: true });
	mkdirSync(join(appRoot, "extensions"), { recursive: true });
	mkdirSync(join(appRoot, "prompts"), { recursive: true });
	writeFileSync(join(appRoot, "dist", "pi", "pi-cli-wrapper.js"), "", "utf8");
	writeFileSync(join(appRoot, "dist", "system", "promise-polyfill.js"), "", "utf8");
	writeFileSync(join(appRoot, "extensions", "research-tools.ts"), "", "utf8");

	const paths = resolvePiPaths(appRoot);

	assert.equal(paths.piPackageRoot, join(appRoot, ".researchx", "npm", "node_modules", "@earendil-works", "pi-coding-agent"));
	assert.equal(paths.piCliPath, join(piDist, "cli.js"));
	assert.deepEqual(validatePiInstallation(appRoot), []);
});

test("package ships source modules required by source-loaded research extensions", () => {
	const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { files?: string[] };
	const packagedFiles = new Set(manifest.files ?? []);

	for (const path of [
		"src/config/paths.ts",
		"src/workbench/data-root.ts",
		"src/workbench/oauth-store.ts",
		"src/workbench/settings-store.ts",
	]) {
		assert.equal(packagedFiles.has(path), true, `${path} must ship with the source-loaded research extension`);
	}
});

test("resolveBundledAlphaCliPath resolves hoisted package installs before bundled fallbacks", () => {
	const root = mkdtempSync(join(tmpdir(), "researchx-alpha-cli-hoisted-"));
	const appRoot = join(root, "node_modules", "@companion-ai", "researchx");
	const hoistedAlpha = join(root, "node_modules", "@companion-ai", "alpha-hub", "bin", "alpha");

	mkdirSync(join(appRoot), { recursive: true });
	writeFileSync(join(appRoot, "package.json"), JSON.stringify({ name: "@companion-ai/researchx" }));
	mkdirSync(dirname(hoistedAlpha), { recursive: true });
	mkdirSync(join(root, "node_modules", "@companion-ai", "alpha-hub", "src"), { recursive: true });
	writeFileSync(
		join(root, "node_modules", "@companion-ai", "alpha-hub", "package.json"),
		JSON.stringify({ name: "@companion-ai/alpha-hub", type: "module", exports: { ".": "./src/index.js" } }),
	);
	writeFileSync(join(root, "node_modules", "@companion-ai", "alpha-hub", "src", "index.js"), "", "utf8");
	writeFileSync(hoistedAlpha, "", "utf8");

	assert.equal(resolveBundledAlphaCliPath(appRoot), realpathSync(hoistedAlpha));
});

test("resolveBundledAlphaCliPath prefers package-local alpha and falls back to the bundled workspace", () => {
	const appRoot = mkdtempSync(join(tmpdir(), "researchx-alpha-cli-"));
	const packageLocalAlpha = join(appRoot, "node_modules", "@companion-ai", "alpha-hub", "bin", "alpha");
	const bundledAlpha = join(appRoot, ".researchx", "npm", "node_modules", "@companion-ai", "alpha-hub", "bin", "alpha");

	mkdirSync(join(appRoot, ".researchx", "npm", "node_modules", "@companion-ai", "alpha-hub", "bin"), { recursive: true });
	writeFileSync(bundledAlpha, "", "utf8");
	assert.equal(resolveBundledAlphaCliPath(appRoot), bundledAlpha);

	mkdirSync(join(appRoot, "node_modules", "@companion-ai", "alpha-hub", "bin"), { recursive: true });
	writeFileSync(packageLocalAlpha, "", "utf8");
	assert.equal(resolveBundledAlphaCliPath(appRoot), packageLocalAlpha);
});

test("pi-cli wrapper derives RESEARCHX_PI_CLI_PATH from the Pi main module", () => {
	const source = readFileSync(join(process.cwd(), "src", "pi", "pi-cli-wrapper.ts"), "utf8");

	assert.match(source, /join\(dirname\(piMainPath\), "cli\.js"\)/);
	assert.match(source, /process\.env\.RESEARCHX_PI_CLI_PATH = piCliPath/);
});

test("toNodeImportSpecifier converts absolute preload paths to file URLs", () => {
	assert.equal(
		toNodeImportSpecifier("/repo/ResearchX-harness/dist/system/promise-polyfill.js"),
		pathToFileURL("/repo/ResearchX-harness/dist/system/promise-polyfill.js").href,
	);
	assert.equal(toNodeImportSpecifier("tsx"), "tsx");
});
