import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getResearchXActiveOrgPath } from "../src/config/paths.js";
import {
	ensureWorkbenchDataRoot,
	getLegacyHomeWorkbenchDataRoot,
	getWorkbenchDataHome,
	getWorkbenchWorkspaceId,
	workbenchDataPath,
} from "../src/workbench/data-root.js";

function withResearchXHome<T>(homeParent: string, callback: () => T): T {
	const previousHome = process.env.RESEARCHX_HOME;
	const previousWorkbenchHome = process.env.RESEARCHX_WORKBENCH_HOME;
	try {
		process.env.RESEARCHX_HOME = homeParent;
		delete process.env.RESEARCHX_WORKBENCH_HOME;
		return callback();
	} finally {
		if (previousHome === undefined) {
			delete process.env.RESEARCHX_HOME;
		} else {
			process.env.RESEARCHX_HOME = previousHome;
		}
		if (previousWorkbenchHome === undefined) {
			delete process.env.RESEARCHX_WORKBENCH_HOME;
		} else {
			process.env.RESEARCHX_WORKBENCH_HOME = previousWorkbenchHome;
		}
	}
}

test("workbench app data lives under the active ResearchX org", () => {
	const root = mkdtempSync(join(tmpdir(), "researchx-workbench-root-"));
	try {
		const workspace = join(root, "workspace");
		mkdirSync(workspace, { recursive: true });
		withResearchXHome(join(root, "home-parent"), () => {
			const dataRoot = ensureWorkbenchDataRoot(workspace);
			const home = join(root, "home-parent", ".researchx");
			const activeOrg = JSON.parse(readFileSync(getResearchXActiveOrgPath(home), "utf8")) as { org_uuid: string };

			assert.equal(getWorkbenchDataHome(), join(home, "orgs", activeOrg.org_uuid, "workbench"));
			assert.equal(dataRoot, join(home, "orgs", activeOrg.org_uuid, "workbench", "workspaces", getWorkbenchWorkspaceId(workspace)));

			const manifest = JSON.parse(readFileSync(join(dataRoot, "workspace.json"), "utf8")) as {
				schema?: string;
				orgUuid?: string;
				workspaceId?: string;
				dataRoot?: string;
				legacyHomeWorkbenchDataRoot?: string;
			};
			assert.equal(manifest.schema, "researchx.workbenchDataRoot.v1");
			assert.equal(manifest.orgUuid, activeOrg.org_uuid);
			assert.equal(manifest.workspaceId, getWorkbenchWorkspaceId(workspace));
			assert.equal(manifest.dataRoot, dataRoot);
			assert.equal(manifest.legacyHomeWorkbenchDataRoot, join(home, "workbench", "workspaces", getWorkbenchWorkspaceId(workspace)));

			const index = JSON.parse(readFileSync(join(getWorkbenchDataHome(), "workspaces.json"), "utf8")) as {
				schema?: string;
				orgUuid?: string;
				workspaces?: Array<{ workspaceId?: string; dataRoot?: string; workingDir?: string }>;
			};
			assert.equal(index.schema, "researchx.workbenchWorkspaceIndex.v1");
			assert.equal(index.orgUuid, activeOrg.org_uuid);
			assert.deepEqual(index.workspaces?.map((entry) => ({
				workspaceId: entry.workspaceId,
				dataRoot: entry.dataRoot,
				workingDir: entry.workingDir,
			})), [{
				workspaceId: getWorkbenchWorkspaceId(workspace),
				dataRoot,
				workingDir: realpathSync.native(workspace),
			}]);
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("workbench app data migrates from legacy home-level workbench storage", () => {
	const root = mkdtempSync(join(tmpdir(), "researchx-workbench-root-"));
	try {
		const workspace = join(root, "workspace");
		mkdirSync(workspace, { recursive: true });
		withResearchXHome(join(root, "home-parent"), () => {
			const legacyRoot = getLegacyHomeWorkbenchDataRoot(workspace);
			mkdirSync(legacyRoot, { recursive: true });
			writeFileSync(join(legacyRoot, "settings.json"), `${JSON.stringify({
				schema: "legacy",
				customConnectors: [{ id: "legacy-lab" }],
			}, null, 2)}\n`);

			const migratedSettingsPath = workbenchDataPath(workspace, "settings.json");

			assert.notEqual(migratedSettingsPath, join(legacyRoot, "settings.json"));
			assert.equal(existsSync(migratedSettingsPath), true);
			assert.match(readFileSync(migratedSettingsPath, "utf8"), /legacy-lab/);
			assert.match(migratedSettingsPath, /\/\.researchx\/orgs\/[0-9a-f-]{36}\/workbench\/workspaces\//);
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
