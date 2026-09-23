import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { resolveChildProcessCommand } from "./lib/child-process-command.mjs";
import { patchPiCodingAgentShrinkwrapSource } from "./lib/pi-shrinkwrap-security-patch.mjs";
import { runWithTemporaryTreeCleanup } from "./lib/temporary-tree-cleanup.mjs";
import { normalizeStaleFixturePath } from "./stale-upgrade-paths.mjs";

const binaryArgument = process.argv[2];
if (!binaryArgument) {
	console.error("Usage: node scripts/verify-stale-pi-upgrade.mjs <researchx-binary>");
	process.exit(1);
}
const binaryPath = resolve(binaryArgument);
const realBinaryPath = realpathSync(binaryPath);
const candidateAppRoots = [
	resolve(dirname(realBinaryPath), ".."),
	resolve(dirname(realBinaryPath), "app"),
].filter((candidate, index, candidates) =>
	candidates.indexOf(candidate) === index && existsSync(resolve(candidate, "package.json"))
);
if (candidateAppRoots.length === 0) {
	throw new Error(`Could not resolve ResearchX's package root from binary: ${binaryPath}`);
}

const root = mkdtempSync(resolve(tmpdir(), "researchx-stale-pi-upgrade-"));
const researchxHome = resolve(root, ".researchx");
const agentDir = resolve(researchxHome, "agent");
const managedNodeModulesPath = resolve(agentDir, "npm", "node_modules");
const persistentNodeModulesPath = process.platform === "win32"
	? resolve(researchxHome, "npm-global", "node_modules")
	: resolve(researchxHome, "npm-global", "lib", "node_modules");
const otelConfigPath = resolve(persistentNodeModulesPath, "pi-otel", "dist", "config.js");

const staleEditorSource = `\
import { cjkBreakRegex, getGraphemeSegmenter, getWordSegmenter, isWhitespaceChar, truncateToWidth, visibleWidth, } from "../utils.js";

export class Editor {
    render(width) {
        const layoutLines = this.layoutText(width);
        return layoutLines.map((line) => line.text);
    }
    handleInput(data) {
        return data;
    }
}
`;

const staleModelRegistrySource = `\
export class ModelRegistry {
    getModel(provider, modelId) {
        return this.models.find((model) => model.provider === provider && model.id === modelId);
    }
}
`;

const staleTuiManifest = `${JSON.stringify({
	name: "@earendil-works/pi-tui",
	version: "0.80.6",
}, null, 2)}\n`;

const staleCodingAgentManifest = `${JSON.stringify({
	name: "@earendil-works/pi-coding-agent",
	version: "0.80.6",
	piConfig: { name: "pi", configDir: ".pi" },
}, null, 2)}\n`;

const staleCodingAgentShrinkwrap = `${JSON.stringify({
	name: "@earendil-works/pi-coding-agent",
	version: "0.80.6",
	lockfileVersion: 3,
	requires: true,
	packages: {
		"": {
			name: "@earendil-works/pi-coding-agent",
			version: "0.80.6",
		},
		"node_modules/brace-expansion": {
			version: "5.0.6",
			resolved: "https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.6.tgz",
			integrity: "sha512-kLpxurY4Z4r9sgMsyG0Z9uzsBlgiU/EFKhj/h91/8yHu0edo7XuixOIH3VcJ8kkxs6/jPzoI6U9Vj3WqbMQ94g==",
			license: "MIT",
			dependencies: { "balanced-match": "^4.0.2" },
			engines: { node: "18 || 20 || >=22" },
		},
	},
}, null, 2)}\n`;

const staleBraceExpansionManifest = `${JSON.stringify({
	name: "brace-expansion",
	version: "5.0.6",
}, null, 2)}\n`;

const staleBraceExpansionSource = "export function expandTop() { return []; }\n";

function getStaleFiles(nodeModulesPath) {
	const staleTuiRoot = resolve(nodeModulesPath, "@earendil-works", "pi-tui");
	const staleCodingAgentRoot = resolve(nodeModulesPath, "@earendil-works", "pi-coding-agent");
	return new Map([
		[resolve(staleTuiRoot, "package.json"), staleTuiManifest],
		[resolve(staleTuiRoot, "dist", "components", "editor.js"), staleEditorSource],
		[resolve(staleCodingAgentRoot, "package.json"), staleCodingAgentManifest],
		[resolve(staleCodingAgentRoot, "dist", "core", "model-registry.js"), staleModelRegistrySource],
		[resolve(staleCodingAgentRoot, "npm-shrinkwrap.json"), staleCodingAgentShrinkwrap],
		[resolve(staleCodingAgentRoot, "node_modules", "brace-expansion", "package.json"), staleBraceExpansionManifest],
		[resolve(staleCodingAgentRoot, "node_modules", "brace-expansion", "index.js"), staleBraceExpansionSource],
	]);
}

const managedStaleFiles = getStaleFiles(managedNodeModulesPath);
const persistentStaleFiles = getStaleFiles(persistentNodeModulesPath);
const persistentCodingAgentRoot = resolve(
	persistentNodeModulesPath,
	"@earendil-works",
	"pi-coding-agent",
);
const persistentTuiRoot = resolve(
	persistentNodeModulesPath,
	"@earendil-works",
	"pi-tui",
);
const persistentOtelRoot = resolve(persistentNodeModulesPath, "pi-otel");
const persistentShrinkwrapPath = resolve(persistentCodingAgentRoot, "npm-shrinkwrap.json");
const persistentBraceExpansionRoot = resolve(
	persistentCodingAgentRoot,
	"node_modules",
	"brace-expansion",
);
const persistentBraceExpansionRelative = normalizeStaleFixturePath(
	relative(persistentNodeModulesPath, persistentBraceExpansionRoot),
);
const allowedPersistentMutationPaths = new Set([
	normalizeStaleFixturePath(relative(persistentNodeModulesPath, persistentShrinkwrapPath)),
	persistentBraceExpansionRelative,
	"pi-otel",
]);
const allowedPersistentMutationPrefixes = [
	`${persistentBraceExpansionRelative}/`,
	"pi-otel/",
];

function writeFiles(files) {
	for (const [path, source] of files) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, source, "utf8");
	}
}

function snapshotTree(rootPath, options = {}) {
	const snapshot = new Map();
	const followSymlinks = options.followSymlinks === true;
	function visit(path, ancestorRealPaths) {
		for (const entry of readdirSync(path, { withFileTypes: true })) {
			const entryPath = resolve(path, entry.name);
			if (entry.isDirectory()) {
				const childAncestors = new Set(ancestorRealPaths);
				childAncestors.add(realpathSync(entryPath));
				visit(entryPath, childAncestors);
				continue;
			}
			if (entry.isSymbolicLink()) {
				const relativePath = normalizeStaleFixturePath(relative(rootPath, entryPath));
				snapshot.set(
					relativePath,
					`symlink:${readlinkSync(entryPath)}`,
				);
				if (followSymlinks) {
					const targetRealPath = realpathSync(entryPath);
					if (ancestorRealPaths.has(targetRealPath)) {
						throw new Error(`Recursive symlink in stale Pi fixture: ${entryPath}`);
					}
					if (statSync(entryPath).isDirectory()) {
						const childAncestors = new Set(ancestorRealPaths);
						childAncestors.add(targetRealPath);
						visit(entryPath, childAncestors);
					} else {
						snapshot.set(
							`${relativePath}#dereferenced-sha256`,
							createHash("sha256").update(readFileSync(entryPath)).digest("hex"),
						);
					}
				}
				continue;
			}
			if (!entry.isFile()) {
				throw new Error(`Unsupported stale Pi fixture entry: ${entryPath}`);
			}
			snapshot.set(
				normalizeStaleFixturePath(relative(rootPath, entryPath)),
				createHash("sha256").update(readFileSync(entryPath)).digest("hex"),
			);
		}
	}
	visit(rootPath, new Set([realpathSync(rootPath)]));
	return snapshot;
}

function snapshotPersistentFixture(options = {}) {
	const snapshot = new Map();
	for (const [label, packageRoot] of [
		["@earendil-works/pi-coding-agent", persistentCodingAgentRoot],
		["@earendil-works/pi-tui", persistentTuiRoot],
		["pi-otel", persistentOtelRoot],
	]) {
		const rootStat = lstatSync(packageRoot);
		snapshot.set(
			label,
			rootStat.isSymbolicLink() ? `symlink:${readlinkSync(packageRoot)}` : "directory",
		);
		for (const [path, digest] of snapshotTree(packageRoot, options)) {
			snapshot.set(`${label}/${path}`, digest);
		}
	}
	return snapshot;
}

function isAllowedPersistentMutation(path) {
	const normalizedPath = normalizeStaleFixturePath(path);
	return allowedPersistentMutationPaths.has(normalizedPath) ||
		allowedPersistentMutationPrefixes.some((prefix) => normalizedPath.startsWith(prefix));
}

function assertOnlyAllowedPersistentMutations(before, after, pass) {
	for (const path of new Set([...before.keys(), ...after.keys()])) {
		if (before.get(path) === after.get(path) || isAllowedPersistentMutation(path)) {
			continue;
		}
		throw new Error(`ResearchX modified stale Pi 0.80.6 path outside the allowlist on pass ${pass}: ${path}`);
	}
}

function assertSnapshotsEqual(expected, actual, message) {
	for (const path of new Set([...expected.keys(), ...actual.keys()])) {
		if (expected.get(path) !== actual.get(path)) {
			throw new Error(`${message}: ${path}`);
		}
	}
}

function assertStaleSecurityRepair(safeBraceExpansionSnapshots) {
	const expectedShrinkwrap = patchPiCodingAgentShrinkwrapSource(staleCodingAgentShrinkwrap);
	if (readFileSync(persistentShrinkwrapPath, "utf8") !== expectedShrinkwrap) {
		throw new Error("ResearchX changed stale Pi's shrinkwrap outside the exact brace-expansion repair");
	}
	const repairedWithSymlink = lstatSync(persistentBraceExpansionRoot).isSymbolicLink();
	const repairedRealPath = realpathSync(persistentBraceExpansionRoot);
	const expectedSafeSnapshot = safeBraceExpansionSnapshots.get(repairedRealPath);
	if (repairedWithSymlink) {
		if (!expectedSafeSnapshot) {
			throw new Error(
				`ResearchX linked stale Pi's brace-expansion repair to an untrusted package tree: ${repairedRealPath}`,
			);
		}
	}
	const fallbackSafeSnapshot = safeBraceExpansionSnapshots.values().next().value;
	if (!fallbackSafeSnapshot) {
		throw new Error("ResearchX's safe brace-expansion package tree is unavailable");
	}
	assertSnapshotsEqual(
		repairedWithSymlink ? expectedSafeSnapshot : fallbackSafeSnapshot,
		snapshotTree(persistentBraceExpansionRoot),
		"ResearchX did not install the exact safe brace-expansion package tree",
	);
}

function assertPatchedOtelTree(trustedOtelSnapshot, trustedOtelRealPath, expectedOtelConfig) {
	if (lstatSync(persistentOtelRoot).isSymbolicLink() &&
		realpathSync(persistentOtelRoot) !== trustedOtelRealPath) {
		throw new Error(
			`ResearchX linked the staged pi-otel extension to an untrusted package tree: ${realpathSync(persistentOtelRoot)}`,
		);
	}
	assertSnapshotsEqual(
		trustedOtelSnapshot,
		snapshotTree(persistentOtelRoot),
		"ResearchX changed the staged pi-otel extension outside its trusted bundled tree",
	);
	if (readFileSync(otelConfigPath, "utf8") !== expectedOtelConfig) {
		throw new Error("ResearchX stale-Pi upgrade extension differs from its trusted candidate baseline");
	}
}

function extractCandidateRuntimeBaseline(appRoot, index) {
	const archivePath = resolve(appRoot, ".researchx", "runtime-workspace.tgz");
	const currentRuntimeRoot = resolve(appRoot, ".researchx", "npm");
	if (!existsSync(archivePath)) {
		if (!existsSync(currentRuntimeRoot)) {
			throw new Error(`ResearchX's candidate runtime is unavailable under ${appRoot}`);
		}
		return currentRuntimeRoot;
	}
	const extractionRoot = resolve(root, "candidate-runtime-baselines", String(index));
	mkdirSync(extractionRoot, { recursive: true });
	const result = spawnSync("tar", ["-xzf", archivePath, "-C", extractionRoot], {
		encoding: "utf8",
		shell: false,
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(
			`Could not extract ResearchX's candidate runtime baseline: ${result.stderr?.trim() || result.status}`,
		);
	}
	return resolve(extractionRoot, "npm");
}

function runResearchX(pass) {
	const invocation = resolveChildProcessCommand(binaryPath, ["--mode", "rpc"]);
	const result = spawnSync(invocation.command, invocation.args, {
		cwd: root,
		env: {
			...process.env,
			DO_NOT_TRACK: "1",
			RESEARCHX_HOME: root,
			HOME: root,
		},
		input: "",
		encoding: "utf8",
		shell: invocation.shell,
		windowsVerbatimArguments: invocation.windowsVerbatimArguments,
		timeout: process.platform === "win32" ? 300_000 : 120_000,
	});
	if (result.error) {
		throw result.error;
	}
	if (result.signal) {
		throw new Error(`ResearchX stale-Pi upgrade smoke pass ${pass} exited with ${result.signal}`);
	}
	if (result.status !== 0) {
		throw new Error(
			[
				`ResearchX stale-Pi upgrade smoke pass ${pass} failed with code ${result.status ?? 1}`,
				result.stdout?.trim(),
				result.stderr?.trim(),
			].filter(Boolean).join("\n"),
		);
	}
}

runWithTemporaryTreeCleanup(root, () => {
	mkdirSync(agentDir, { recursive: true });
	writeFileSync(
		resolve(agentDir, "settings.json"),
		JSON.stringify({ packages: [], quietStartup: true }, null, 2) + "\n",
		"utf8",
	);

	const candidateBaselines = candidateAppRoots.map((appRoot, index) => {
		const baselineRuntimeRoot = extractCandidateRuntimeBaseline(appRoot, index);
		const requireFromCandidate = createRequire(resolve(appRoot, "package.json"));
		const directBraceRoot = dirname(
			requireFromCandidate.resolve("brace-expansion/package.json"),
		);
		const baselineRuntimeBraceRoot = resolve(
			baselineRuntimeRoot,
			"node_modules",
			"brace-expansion",
		);
		const baselineRuntimeOtelRoot = resolve(
			baselineRuntimeRoot,
			"node_modules",
			"pi-otel",
		);
		for (const requiredPath of [
			directBraceRoot,
			baselineRuntimeBraceRoot,
			baselineRuntimeOtelRoot,
		]) {
			if (!existsSync(requiredPath)) {
				throw new Error(`ResearchX's candidate baseline is missing: ${requiredPath}`);
			}
		}
		return {
			appRoot,
			baselineRuntimeRoot,
			directBraceRoot,
			directBraceSnapshot: snapshotTree(directBraceRoot),
			runtimeBraceRoot: resolve(appRoot, ".researchx", "npm", "node_modules", "brace-expansion"),
			baselineRuntimeBraceRoot,
			baselineRuntimeBraceSnapshot: snapshotTree(baselineRuntimeBraceRoot),
			runtimeOtelRoot: resolve(appRoot, ".researchx", "npm", "node_modules", "pi-otel"),
			baselineRuntimeOtelRoot,
			baselineRuntimeOtelSnapshot: snapshotTree(baselineRuntimeOtelRoot),
			baselineRuntimeOtelConfig: readFileSync(
				resolve(baselineRuntimeOtelRoot, "dist", "config.js"),
				"utf8",
			),
		};
	});

	// Let the exact candidate initialize its trusted runtime trees before the
	// stale fixture is staged. This gives the verifier a baseline that catches
	// candidate code mutating a symlink target during either stale launch.
	runResearchX("setup");
	const safeBraceExpansionSnapshots = new Map();
	for (const baseline of candidateBaselines) {
		for (const [candidatePath, baselineSnapshot] of [
			[baseline.directBraceRoot, baseline.directBraceSnapshot],
			[baseline.runtimeBraceRoot, baseline.baselineRuntimeBraceSnapshot],
		]) {
			if (!existsSync(candidatePath)) {
				throw new Error(`ResearchX's candidate did not initialize: ${candidatePath}`);
			}
			assertSnapshotsEqual(
				baselineSnapshot,
				snapshotTree(candidatePath),
				"ResearchX's setup launch changed a trusted brace-expansion tree",
			);
			safeBraceExpansionSnapshots.set(realpathSync(candidatePath), baselineSnapshot);
		}
	}
	const trustedOtelBaseline = candidateBaselines.find((candidate) =>
		existsSync(candidate.runtimeOtelRoot)
	);
	if (!trustedOtelBaseline) {
		throw new Error("ResearchX's trusted bundled pi-otel tree was not initialized");
	}
	const trustedOtelRoot = trustedOtelBaseline.runtimeOtelRoot;
	const trustedOtelRealPath = realpathSync(trustedOtelRoot);
	const trustedOtelSnapshot = trustedOtelBaseline.baselineRuntimeOtelSnapshot;
	assertSnapshotsEqual(
		trustedOtelSnapshot,
		snapshotTree(trustedOtelRoot),
		"ResearchX's setup launch changed its trusted pi-otel tree",
	);
	const expectedOtelConfig = trustedOtelBaseline.baselineRuntimeOtelConfig;

	for (const packageRoot of [
		resolve(managedNodeModulesPath, "@earendil-works", "pi-coding-agent"),
		resolve(managedNodeModulesPath, "@earendil-works", "pi-tui"),
		resolve(managedNodeModulesPath, "pi-otel"),
		persistentCodingAgentRoot,
		persistentTuiRoot,
		persistentOtelRoot,
	]) {
		rmSync(packageRoot, { recursive: true, force: true });
	}
	writeFiles(managedStaleFiles);
	writeFiles(persistentStaleFiles);
	cpSync(trustedOtelRoot, persistentOtelRoot, {
		recursive: true,
		dereference: true,
	});
	const persistentBefore = snapshotPersistentFixture();

	runResearchX(1);

	const persistentAfterFirstPass = snapshotPersistentFixture();
	assertOnlyAllowedPersistentMutations(persistentBefore, persistentAfterFirstPass, 1);
	assertStaleSecurityRepair(safeBraceExpansionSnapshots);
	const patchedOtelConfig = readFileSync(otelConfigPath, "utf8");
	for (const marker of [
		"const createResearchXSignalConfig = (signal) =>",
		"const researchxOtlpSignals = {",
	]) {
		if (!patchedOtelConfig.includes(marker)) {
			throw new Error(`ResearchX stale-Pi upgrade smoke did not patch the extension marker: ${marker}`);
		}
	}
	assertPatchedOtelTree(trustedOtelSnapshot, trustedOtelRealPath, expectedOtelConfig);
	const persistentAfterFirstPassDereferenced = snapshotPersistentFixture({
		followSymlinks: true,
	});

	// Pi may reconcile its managed npm directory after startup. Restore the
	// stale shape so the second launch exercises the same upgrade boundary.
	writeFiles(managedStaleFiles);
	runResearchX(2);
	const persistentAfterSecondPass = snapshotPersistentFixture({ followSymlinks: true });
	assertSnapshotsEqual(
		persistentAfterFirstPassDereferenced,
		persistentAfterSecondPass,
		"ResearchX stale-Pi upgrade smoke was not byte-idempotent on pass 2",
	);
	assertStaleSecurityRepair(safeBraceExpansionSnapshots);
	assertPatchedOtelTree(trustedOtelSnapshot, trustedOtelRealPath, expectedOtelConfig);
	if (readFileSync(otelConfigPath, "utf8") !== patchedOtelConfig) {
		throw new Error("ResearchX stale-Pi upgrade extension patch was not idempotent");
	}
	console.log("ResearchX stale Pi 0.80.6 core-entrypoint isolation and security-repair smoke passed twice.");
});
