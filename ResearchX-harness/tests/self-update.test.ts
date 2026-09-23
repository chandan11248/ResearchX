import test from "node:test";
import assert from "node:assert/strict";

import { getResearchXUpgradeLines, isNewerVersion } from "../src/system/self-update.js";

test("isNewerVersion compares release versions numerically", () => {
	assert.equal(isNewerVersion("0.2.59", "0.2.58"), true);
	assert.equal(isNewerVersion("0.3.0", "0.2.58"), true);
	assert.equal(isNewerVersion("1.0.0", "0.2.58"), true);
	assert.equal(isNewerVersion("0.2.58", "0.2.58"), false);
	assert.equal(isNewerVersion("0.2.57", "0.2.58"), false);
	assert.equal(isNewerVersion("0.2.10", "0.2.9"), true);
});

test("isNewerVersion rejects non-release version strings", () => {
	assert.equal(isNewerVersion("0.2.59-beta.1", "0.2.58"), false);
	assert.equal(isNewerVersion("latest", "0.2.58"), false);
	assert.equal(isNewerVersion("0.2.59", "unknown"), false);
});

test("getResearchXUpgradeLines points npm installs at npm", () => {
	const lines = getResearchXUpgradeLines("0.2.59", "0.2.58", { standaloneBundle: false, platform: "win32" });
	assert.equal(lines[0], "A newer ResearchX is available: 0.2.59 (installed 0.2.58).");
	assert.equal(lines[1], "Update the CLI itself with: npm install -g researchx");
});

test("getResearchXUpgradeLines points standalone bundles at the installer", () => {
	const windowsLines = getResearchXUpgradeLines("0.2.59", "0.2.58", { standaloneBundle: true, platform: "win32" });
	assert.equal(windowsLines[1], "Update the CLI itself with: Download the latest release from https://github.com/chandan11248/ResearchX-harness/releases");

	const unixLines = getResearchXUpgradeLines("0.2.59", "0.2.58", { standaloneBundle: true, platform: "darwin" });
	assert.equal(unixLines[1], "Update the CLI itself with: Download the latest release from https://github.com/chandan11248/ResearchX-harness/releases");
});
