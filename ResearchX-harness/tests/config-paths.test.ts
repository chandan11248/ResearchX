import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
	ensureResearchXHome,
	ensureResearchXActiveOrg,
	getBootstrapStatePath,
	getDefaultSessionDir,
	getResearchXActiveOrgDir,
	getResearchXActiveOrgPath,
	getResearchXAgentDir,
	getResearchXHome,
	getResearchXMemoryDir,
	getResearchXOrgDatabasePath,
	getResearchXOrgsDir,
	getResearchXStateDir,
} from "../src/config/paths.js";

test("getResearchXHome uses RESEARCHX_HOME env var when set", () => {
	const previous = process.env.RESEARCHX_HOME;
	try {
		process.env.RESEARCHX_HOME = "/custom/home";
		assert.equal(getResearchXHome(), resolve("/custom/home", ".researchx"));
	} finally {
		if (previous === undefined) {
			delete process.env.RESEARCHX_HOME;
		} else {
			process.env.RESEARCHX_HOME = previous;
		}
	}
});

test("getResearchXHome falls back to homedir when RESEARCHX_HOME is unset", () => {
	const previous = process.env.RESEARCHX_HOME;
	try {
		delete process.env.RESEARCHX_HOME;
		const home = getResearchXHome();
		assert.ok(home.endsWith(".researchx"), `expected path ending in .researchx, got: ${home}`);
		assert.ok(!home.includes("undefined"), `expected no 'undefined' in path, got: ${home}`);
	} finally {
		if (previous === undefined) {
			delete process.env.RESEARCHX_HOME;
		} else {
			process.env.RESEARCHX_HOME = previous;
		}
	}
});

test("getResearchXAgentDir resolves to <home>/agent", () => {
	assert.equal(getResearchXAgentDir("/some/home"), resolve("/some/home", "agent"));
});

test("getResearchXOrgsDir resolves to <home>/orgs", () => {
	assert.equal(getResearchXOrgsDir("/some/home"), resolve("/some/home", "orgs"));
});

test("getResearchXActiveOrgPath resolves to <home>/active-org.json", () => {
	assert.equal(getResearchXActiveOrgPath("/some/home"), resolve("/some/home", "active-org.json"));
});

test("getResearchXOrgDatabasePath resolves to the active org database", () => {
	const root = mkdtempSync(join(tmpdir(), "researchx-paths-"));
	try {
		const home = join(root, "home");
		const org = ensureResearchXActiveOrg(home);
		assert.equal(getResearchXOrgDatabasePath(home), resolve(home, "orgs", org.org_uuid, "researchx-workbench.db"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("getResearchXMemoryDir resolves to <home>/memory", () => {
	assert.equal(getResearchXMemoryDir("/some/home"), resolve("/some/home", "memory"));
});

test("getResearchXStateDir resolves to <home>/.state", () => {
	assert.equal(getResearchXStateDir("/some/home"), resolve("/some/home", ".state"));
});

test("getDefaultSessionDir resolves to <home>/sessions", () => {
	assert.equal(getDefaultSessionDir("/some/home"), resolve("/some/home", "sessions"));
});

test("getBootstrapStatePath resolves to <home>/.state/bootstrap.json", () => {
	assert.equal(getBootstrapStatePath("/some/home"), resolve("/some/home", ".state", "bootstrap.json"));
});

test("ensureResearchXHome creates all required subdirectories", () => {
	const root = mkdtempSync(join(tmpdir(), "researchx-paths-"));
	try {
		const home = join(root, "home");
		ensureResearchXHome(home);

		assert.ok(existsSync(home), "home dir should exist");
		assert.ok(existsSync(join(home, "active-org.json")), "active org manifest should exist");
		assert.ok(existsSync(join(home, "orgs")), "orgs dir should exist");
		assert.ok(existsSync(join(home, "agent")), "agent dir should exist");
		assert.ok(existsSync(join(home, "memory")), "memory dir should exist");
		assert.ok(existsSync(join(home, ".state")), ".state dir should exist");
		assert.ok(existsSync(join(home, "sessions")), "sessions dir should exist");
		const activeOrg = JSON.parse(readFileSync(join(home, "active-org.json"), "utf8")) as { org_uuid?: string; login_owner_data_dir?: string };
		assert.equal(activeOrg.login_owner_data_dir, home);
		assert.match(activeOrg.org_uuid ?? "", /^[0-9a-f-]{36}$/);
		assert.ok(existsSync(join(home, "orgs", activeOrg.org_uuid ?? "")), "active org dir should exist");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ensureResearchXHome is idempotent when dirs already exist", () => {
	const root = mkdtempSync(join(tmpdir(), "researchx-paths-"));
	try {
		const home = join(root, "home");
		ensureResearchXHome(home);
		assert.doesNotThrow(() => ensureResearchXHome(home));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ensureResearchXActiveOrg preserves a reference-shaped existing active org", () => {
	const root = mkdtempSync(join(tmpdir(), "researchx-paths-"));
	try {
		const home = join(root, "home");
		mkdirSync(home, { recursive: true });
		const orgUuid = "11111111-1111-4111-8111-111111111111";
		const accountUuid = "22222222-2222-4222-8222-222222222222";
		writeFileSync(getResearchXActiveOrgPath(home), `${JSON.stringify({
			org_uuid: orgUuid,
			org_name: "Lab Org",
			account_uuid: accountUuid,
			login_owner_data_dir: home,
		}, null, 2)}\n`);

		const activeOrg = ensureResearchXActiveOrg(home);

		assert.equal(activeOrg.org_uuid, orgUuid);
		assert.equal(activeOrg.org_name, "Lab Org");
		assert.equal(activeOrg.account_uuid, accountUuid);
		assert.equal(getResearchXActiveOrgDir(home), join(home, "orgs", orgUuid));
		assert.ok(existsSync(join(home, "orgs", orgUuid)));
		const persisted = JSON.parse(readFileSync(getResearchXActiveOrgPath(home), "utf8")) as { schema?: string };
		assert.equal(persisted.schema, "researchx.activeOrg.v1");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ensureResearchXActiveOrg does not rewrite a valid manifest", () => {
	const root = mkdtempSync(join(tmpdir(), "researchx-paths-"));
	try {
		const home = join(root, "home");
		const activeOrg = ensureResearchXActiveOrg(home);
		const path = getResearchXActiveOrgPath(home);
		const before = statSync(path, { bigint: true });

		for (let index = 0; index < 20; index += 1) {
			assert.equal(ensureResearchXActiveOrg(home).org_uuid, activeOrg.org_uuid);
		}

		const after = statSync(path, { bigint: true });
		assert.equal(after.mtimeNs, before.mtimeNs);
		assert.equal(after.ino, before.ino);
		assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), activeOrg);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
