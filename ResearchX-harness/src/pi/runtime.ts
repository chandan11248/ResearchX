import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	BROWSER_FALLBACK_PATHS,
	MERMAID_FALLBACK_PATHS,
	PANDOC_FALLBACK_PATHS,
	resolveExecutable,
	type ResolvedExecutables,
} from "../system/executables.js";
import { getPostHogOtelEnv } from "../telemetry/posthog.js";
import { getPiWebSearchConfigPath } from "./web-access.js";

export type PiRuntimeOptions = {
	appRoot: string;
	workingDir: string;
	sessionDir: string;
	researchxAgentDir: string;
	researchxVersion?: string;
	mode?: "text" | "json" | "rpc";
	thinkingLevel?: string;
	explicitModelSpec?: string;
	sessionId?: string;
	resumeRecentSession?: boolean;
	oneShotPrompt?: string;
	initialPrompt?: string;
	preLaunchNotice?: string;
};

export function getResearchXNpmPrefixPath(researchxAgentDir: string): string {
	return resolve(dirname(researchxAgentDir), "npm-global");
}

export function getResearchXNpmGlobalNodeModulesPath(
	researchxAgentDir: string,
	platform = process.platform,
): string {
	const prefix = getResearchXNpmPrefixPath(researchxAgentDir);
	return platform === "win32"
		? resolve(prefix, "node_modules")
		: resolve(prefix, "lib", "node_modules");
}

export function getResearchXCommandShimDir(researchxAgentDir: string): string {
	return resolve(dirname(researchxAgentDir), "bin");
}

export function getResearchXCliBinPath(appRoot: string): string {
	return resolve(appRoot, "bin", "researchx.js");
}

function shellSingleQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export function ensureResearchXCommandShim(appRoot: string, researchxAgentDir: string): string {
	const shimDir = getResearchXCommandShimDir(researchxAgentDir);
	const shimPath = resolve(shimDir, "researchx");
	const researchxBinPath = getResearchXCliBinPath(appRoot);
	const script = [
		"#!/bin/sh",
		'RESEARCHX_NODE="${RESEARCHX_NODE_EXECUTABLE:-node}"',
		'RESEARCHX_BIN="${RESEARCHX_BIN_PATH:-}"',
		'if [ -z "$RESEARCHX_BIN" ]; then',
		`\tRESEARCHX_BIN=${shellSingleQuote(researchxBinPath)}`,
		"fi",
		'exec "$RESEARCHX_NODE" "$RESEARCHX_BIN" "$@"',
		"",
	].join("\n");

	mkdirSync(shimDir, { recursive: true });
	writeFileSync(shimPath, script, { encoding: "utf8", mode: 0o755 });
	chmodSync(shimPath, 0o755);
	return shimPath;
}

export function ensureResearchXWorkspaceScaffold(
	workingDir: string,
	createDirectory: typeof mkdirSync = mkdirSync,
): boolean {
	for (const relPath of [
		"outputs/.plans",
		"outputs/.drafts",
		"papers",
		"notes",
	]) {
		try {
			createDirectory(resolve(workingDir, relPath), { recursive: true });
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
				return false;
			}
			throw error;
		}
	}
	return true;
}

export function applyResearchXPackageManagerEnv(researchxAgentDir: string): string {
	const researchxNpmPrefixPath = getResearchXNpmPrefixPath(researchxAgentDir);
	process.env.RESEARCHX_NPM_PREFIX = researchxNpmPrefixPath;
	process.env.NPM_CONFIG_PREFIX = researchxNpmPrefixPath;
	process.env.npm_config_prefix = researchxNpmPrefixPath;
	return researchxNpmPrefixPath;
}

function resolvePiPackageRoot(nodeModulesPath: string): string {
	const candidates = [
		resolve(nodeModulesPath, "@earendil-works", "pi-coding-agent"),
		resolve(nodeModulesPath, "@mariozechner", "pi-coding-agent"),
	];
	return candidates.find((candidate) => existsSync(resolve(candidate, "dist", "cli.js"))) ?? candidates[0]!;
}

export function resolvePiPaths(appRoot: string) {
	const workspaceNodeModulesPath = resolve(appRoot, ".researchx", "npm", "node_modules");
	const packageLocalPiRoot = resolvePiPackageRoot(resolve(appRoot, "node_modules"));
	const workspacePiRoot = resolvePiPackageRoot(workspaceNodeModulesPath);
	const piPackageRoot = existsSync(resolve(packageLocalPiRoot, "dist", "cli.js")) || !existsSync(resolve(workspacePiRoot, "dist", "cli.js"))
		? packageLocalPiRoot
		: workspacePiRoot;
	const packageLocalTsxLoaderPath = resolve(appRoot, "node_modules", "tsx", "dist", "loader.mjs");
	const workspaceTsxLoaderPath = resolve(workspaceNodeModulesPath, "tsx", "dist", "loader.mjs");
	return {
		piPackageRoot,
		piCliPath: resolve(piPackageRoot, "dist", "cli.js"),
		piMainPath: resolve(piPackageRoot, "dist", "main.js"),
		piCliWrapperPath: resolve(appRoot, "dist", "pi", "pi-cli-wrapper.js"),
		piCliWrapperSourcePath: resolve(appRoot, "src", "pi", "pi-cli-wrapper.ts"),
		promisePolyfillPath: resolve(appRoot, "dist", "system", "promise-polyfill.js"),
		promisePolyfillSourcePath: resolve(appRoot, "src", "system", "promise-polyfill.ts"),
		tsxLoaderPath: existsSync(packageLocalTsxLoaderPath) || !existsSync(workspaceTsxLoaderPath)
			? packageLocalTsxLoaderPath
			: workspaceTsxLoaderPath,
		researchToolsPath: resolve(appRoot, "extensions", "research-tools.ts"),
		promptTemplatePath: resolve(appRoot, "prompts"),
		systemPromptPath: resolve(appRoot, ".researchx", "SYSTEM.md"),
		piWorkspaceNodeModulesPath: workspaceNodeModulesPath,
		nodeModulesBinPath: resolve(appRoot, "node_modules", ".bin"),
	};
}

export type PiPaths = ReturnType<typeof resolvePiPaths>;

export function toNodeImportSpecifier(modulePath: string): string {
	return isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath;
}

export function validatePiInstallation(appRoot: string): string[] {
	const paths = resolvePiPaths(appRoot);
	const missing: string[] = [];

	if (!existsSync(paths.piCliPath)) missing.push(paths.piCliPath);
	if (!existsSync(paths.piMainPath)) missing.push(paths.piMainPath);
	if (!existsSync(paths.piCliWrapperPath)) {
		const hasDevWrapper = existsSync(paths.piCliWrapperSourcePath) && existsSync(paths.tsxLoaderPath);
		if (!hasDevWrapper) missing.push(paths.piCliWrapperPath);
	}
	if (!existsSync(paths.promisePolyfillPath)) {
		// Dev fallback: allow running from source without `dist/` build artifacts.
		const hasDevPolyfill = existsSync(paths.promisePolyfillSourcePath) && existsSync(paths.tsxLoaderPath);
		if (!hasDevPolyfill) missing.push(paths.promisePolyfillPath);
	}
	if (!existsSync(paths.researchToolsPath)) missing.push(paths.researchToolsPath);
	if (!existsSync(paths.promptTemplatePath)) missing.push(paths.promptTemplatePath);

	return missing;
}

export function buildPiArgs(options: PiRuntimeOptions, paths: PiPaths = resolvePiPaths(options.appRoot)): string[] {
	const args = [
		"--session-dir",
		options.sessionDir,
		"--extension",
		paths.researchToolsPath,
		"--prompt-template",
		paths.promptTemplatePath,
	];

	if (existsSync(paths.systemPromptPath)) {
		args.push("--system-prompt", readFileSync(paths.systemPromptPath, "utf8"));
	}

	if (options.mode) {
		args.push("--mode", options.mode);
	}
	if (options.explicitModelSpec) {
		args.push("--model", options.explicitModelSpec);
	}
	if (options.sessionId) {
		args.push("--session-id", options.sessionId);
	}
	if (options.thinkingLevel) {
		args.push("--thinking", options.thinkingLevel);
	}
	// The regular (main-screen) TUI redraws in place and clears terminal
	// scrollback on full redraws, so long conversations get clipped and the
	// start becomes unreachable. Fullscreen mode keeps an in-TUI scrollable
	// transcript (Home/End, PgUp/PgDn, mouse wheel) instead. Interactive runs
	// only; one-shot and rpc/json launches never open a TUI.
	if (
		(options.mode === undefined || options.mode === "text") &&
		!options.oneShotPrompt &&
		!options.initialPrompt
	) {
		const tuiMode = process.env.RESEARCHX_TUI_MODE === "regular" ? "regular" : "fullscreen";
		args.push("--tui-mode", tuiMode);
	}
	if (options.resumeRecentSession) {
		args.push("--continue");
	}
	if (options.oneShotPrompt) {
		args.push("-p", "--", options.oneShotPrompt);
	} else if (options.initialPrompt) {
		args.push("--", options.initialPrompt);
	}

	return args;
}

export function buildPiEnv(
	options: PiRuntimeOptions,
	paths: PiPaths = resolvePiPaths(options.appRoot),
	executables?: ResolvedExecutables,
): NodeJS.ProcessEnv {
	const researchxNpmPrefixPath = getResearchXNpmPrefixPath(options.researchxAgentDir);
	const researchxNpmBinPath = resolve(researchxNpmPrefixPath, "bin");
	const researchxCommandShimDir = getResearchXCommandShimDir(options.researchxAgentDir);
	const researchxWebSearchConfigPath = getPiWebSearchConfigPath();
	const researchxBinPath = getResearchXCliBinPath(options.appRoot);

	const currentPath = process.env.PATH ?? "";
	const binEntries = [researchxCommandShimDir, paths.nodeModulesBinPath, resolve(paths.piWorkspaceNodeModulesPath, ".bin"), researchxNpmBinPath];
	const binPath = binEntries.join(delimiter);
	const pandocPath = process.env.PANDOC_PATH ?? executables?.pandoc ?? resolveExecutable("pandoc", PANDOC_FALLBACK_PATHS);
	const mermaidPath = process.env.MERMAID_CLI_PATH ?? executables?.mermaid ?? resolveExecutable("mmdc", MERMAID_FALLBACK_PATHS);
	const browserPath =
		process.env.PUPPETEER_EXECUTABLE_PATH ?? executables?.browser ?? resolveExecutable("google-chrome", BROWSER_FALLBACK_PATHS);
	const telemetryEnv = getPostHogOtelEnv("researchx-pi", options.researchxVersion);
	return {
		...process.env,
		...telemetryEnv,
		PATH: `${binPath}${delimiter}${currentPath}`,
		RESEARCHX_VERSION: options.researchxVersion,
		RESEARCHX_SESSION_DIR: options.sessionDir,
		RESEARCHX_MEMORY_DIR: resolve(dirname(options.researchxAgentDir), "memory"),
		RESEARCHX_WEB_SEARCH_CONFIG: researchxWebSearchConfigPath,
		RESEARCHX_NODE_EXECUTABLE: process.execPath,
		RESEARCHX_BIN_PATH: researchxBinPath,
		RESEARCHX_PI_CLI_PATH: paths.piCliPath,
		RESEARCHX_NPM_PREFIX: researchxNpmPrefixPath,
		// Ensure the Pi child process uses ResearchX's agent dir for auth/models/settings.
		// Patched Pi uses RESEARCHX_CODING_AGENT_DIR; upstream Pi uses PI_CODING_AGENT_DIR.
		RESEARCHX_CODING_AGENT_DIR: options.researchxAgentDir,
		PI_CODING_AGENT_DIR: options.researchxAgentDir,
		PANDOC_PATH: pandocPath,
		PI_HARDWARE_CURSOR: process.env.PI_HARDWARE_CURSOR ?? "1",
		PI_SKIP_VERSION_CHECK: process.env.PI_SKIP_VERSION_CHECK ?? "1",
		MERMAID_CLI_PATH: mermaidPath,
		PUPPETEER_EXECUTABLE_PATH: browserPath,
		// Always pin npm's global prefix to the ResearchX workspace. npm injects
		// lowercase config vars into child processes, which would otherwise leak
		// the caller's global prefix into Pi.
		NPM_CONFIG_PREFIX: researchxNpmPrefixPath,
		npm_config_prefix: researchxNpmPrefixPath,
	};
}
