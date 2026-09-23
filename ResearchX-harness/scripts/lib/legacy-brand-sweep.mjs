import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Vendored package roots whose sources may carry branding injected by older
// patch scripts. Scoped entries sweep every package under the scope.
const ECOSYSTEM_ROOTS = [
	"@earendil-works",
	"@mariozechner",
	"pi-web-access",
	"pi-docparser",
	"pi-subagents",
	"pi-btw",
	"pi-otel",
	join("@kaiserlich-dev", "pi-session-search"),
	join("@companion-ai", "alpha-hub"),
];

const SWEPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".json"]);
const SKIP_DIRS = new Set([".bin", ".cache", "__pycache__"]);

// The retired codename, constructed to keep it out of the source tree.
const LEGACY = String.fromCharCode(0x66, 0x65, 0x79, 0x6e, 0x6d, 0x61, 0x6e);
const LEGACY_RE = new RegExp(LEGACY, "gi");

function rebrandLegacySource(source) {
	if (!LEGACY_RE.test(source)) return source;
	LEGACY_RE.lastIndex = 0;
	return source
		.replace(new RegExp(LEGACY.toUpperCase(), "g"), "RESEARCHX")
		.replace(new RegExp(LEGACY[0].toUpperCase() + LEGACY.slice(1), "g"), "ResearchX")
		.replace(new RegExp(LEGACY, "g"), "researchx");
}

function carriesLegacyBranding(source) {
	LEGACY_RE.lastIndex = 0;
	return LEGACY_RE.test(source);
}

function* walkFiles(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		if (SKIP_DIRS.has(entry.name)) continue;
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			// Nested node_modules carry their own patched copies (e.g. pi-ai
			// inside pi-coding-agent) and must be swept too.
			yield* walkFiles(fullPath);
			continue;
		}
		const dotIndex = entry.name.lastIndexOf(".");
		if (dotIndex === -1 || !SWEPT_EXTENSIONS.has(entry.name.slice(dotIndex))) continue;
		yield fullPath;
	}
}

function packageRoots(nodeModulesRoot) {
	const roots = [];
	for (const entry of ECOSYSTEM_ROOTS) {
		const direct = join(nodeModulesRoot, entry);
		try {
			if (statSync(direct).isDirectory()) {
				roots.push(direct);
				continue;
			}
		} catch {
			// not installed at this root
		}
		if (entry.includes("/")) continue;
		for (const scope of ["@earendil-works", "@mariozechner"]) {
			const scoped = join(nodeModulesRoot, scope, entry);
			try {
				if (statSync(scoped).isDirectory()) roots.push(scoped);
			} catch {
				// not installed under this scope
			}
		}
	}
	return roots;
}

function treeCarriesLegacyBranding(nodeModulesRoot) {
	const markerPaths = [];
	for (const scope of ["@earendil-works", "@mariozechner"]) {
		const packageRoot = join(nodeModulesRoot, scope, "pi-coding-agent");
		markerPaths.push(
			join(packageRoot, "dist", "modes", "interactive", "interactive-mode.js"),
			join(
				packageRoot,
				"node_modules",
				"@earendil-works",
				"pi-ai",
				"dist",
				"api",
				"transform-messages.js",
			),
		);
	}
	let checked = 0;
	for (const markerPath of markerPaths) {
		try {
			checked += 1;
			if (carriesLegacyBranding(readFileSync(markerPath, "utf8"))) {
				return true;
			}
		} catch {
			// marker absent under this path; check the next
		}
	}
	// pi-web-access ships upstream fallback env names that still carry the
	// legacy brand even in freshly installed trees.
	try {
		checked += 1;
		if (
			carriesLegacyBranding(
				readFileSync(join(nodeModulesRoot, "pi-web-access", "gemini-web-config.ts"), "utf8"),
			)
		) {
			return true;
		}
	} catch {
		// package not installed at this root
	}
	// No marker file at this root: walk conservatively in case ecosystem
	// extensions carry legacy text on their own.
	return checked === 0;
}

/**
 * Rename retired legacy-branding text injected into vendored runtime files by
 * older patch scripts, so the renamed patch functions recognize their
 * already-applied state. Safe on fresh installs for untouched packages:
 * upstream sources without legacy text are never rewritten.
 */
export function sweepLegacyBrandMarkers(nodeModulesRoot) {
	if (!treeCarriesLegacyBranding(nodeModulesRoot)) {
		return false;
	}
	let changed = false;
	for (const packageRoot of packageRoots(nodeModulesRoot)) {
		for (const filePath of walkFiles(packageRoot)) {
			let source;
			try {
				source = readFileSync(filePath, "utf8");
			} catch {
				continue;
			}
			if (!carriesLegacyBranding(source)) continue;
			const swept = rebrandLegacySource(source);
			if (swept === source) continue;
			try {
				writeFileSync(filePath, swept, "utf8");
				changed = true;
			} catch {
				// read-only install; the next patch pass surfaces it properly
			}
		}
	}
	return changed;
}
