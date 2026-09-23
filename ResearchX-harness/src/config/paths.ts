import { randomUUID } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const ACTIVE_ORG_SCHEMA = "researchx.activeOrg.v1";

export type ResearchXActiveOrg = {
	schema: typeof ACTIVE_ORG_SCHEMA;
	org_uuid: string;
	org_name: string;
	account_uuid: string;
	login_owner_data_dir: string;
};

export function getResearchXHome(): string {
	return resolve(process.env.RESEARCHX_HOME ?? homedir(), ".researchx");
}

export function getResearchXOrgsDir(home = getResearchXHome()): string {
	return resolve(home, "orgs");
}

export function getResearchXActiveOrgPath(home = getResearchXHome()): string {
	return resolve(home, "active-org.json");
}

export function getResearchXAgentDir(home = getResearchXHome()): string {
	return resolve(home, "agent");
}

export function getResearchXMemoryDir(home = getResearchXHome()): string {
	return resolve(home, "memory");
}

export function getResearchXStateDir(home = getResearchXHome()): string {
	return resolve(home, ".state");
}

export function getDefaultSessionDir(home = getResearchXHome()): string {
	return resolve(home, "sessions");
}

export function getBootstrapStatePath(home = getResearchXHome()): string {
	return resolve(getResearchXStateDir(home), "bootstrap.json");
}

function normalizeActiveOrg(home: string, value: unknown): ResearchXActiveOrg | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	const orgUuid = typeof record.org_uuid === "string" && record.org_uuid.trim() ? record.org_uuid.trim() : undefined;
	if (!orgUuid) return undefined;
	const accountUuid = typeof record.account_uuid === "string" && record.account_uuid.trim()
		? record.account_uuid.trim()
		: randomUUID();
	const orgName = typeof record.org_name === "string" && record.org_name.trim()
		? record.org_name.trim()
		: "ResearchX Local Workspace";
	const ownerDir = typeof record.login_owner_data_dir === "string" && record.login_owner_data_dir.trim()
		? record.login_owner_data_dir.trim()
		: home;
	return {
		schema: ACTIVE_ORG_SCHEMA,
		org_uuid: orgUuid,
		org_name: orgName,
		account_uuid: accountUuid,
		login_owner_data_dir: ownerDir,
	};
}

function activeOrgJson(org: ResearchXActiveOrg): string {
	return `${JSON.stringify(org, null, 2)}\n`;
}

function writeActiveOrgAtomic(path: string, org: ResearchXActiveOrg): void {
	const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temporaryPath, activeOrgJson(org), { encoding: "utf8", mode: 0o600, flag: "wx" });
		renameSync(temporaryPath, path);
	} finally {
		rmSync(temporaryPath, { force: true });
	}
}

function createActiveOrg(path: string, org: ResearchXActiveOrg): boolean {
	const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temporaryPath, activeOrgJson(org), { encoding: "utf8", mode: 0o600, flag: "wx" });
		try {
			linkSync(temporaryPath, path);
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
			throw error;
		}
	} finally {
		rmSync(temporaryPath, { force: true });
	}
}

export function ensureResearchXActiveOrg(home = getResearchXHome()): ResearchXActiveOrg {
	mkdirSync(home, { recursive: true });
	mkdirSync(getResearchXOrgsDir(home), { recursive: true });
	const path = getResearchXActiveOrgPath(home);
	if (existsSync(path)) {
		try {
			const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
			const normalized = normalizeActiveOrg(home, parsed);
			if (normalized) {
				if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
					writeActiveOrgAtomic(path, normalized);
				}
				mkdirSync(resolve(getResearchXOrgsDir(home), normalized.org_uuid), { recursive: true });
				return normalized;
			}
		} catch {
			// Fall through and create a fresh local org manifest below.
		}
	}
	const org: ResearchXActiveOrg = {
		schema: ACTIVE_ORG_SCHEMA,
		org_uuid: randomUUID(),
		org_name: "ResearchX Local Workspace",
		account_uuid: randomUUID(),
		login_owner_data_dir: home,
	};
	if (!createActiveOrg(path, org)) {
		try {
			const existing = normalizeActiveOrg(home, JSON.parse(readFileSync(path, "utf8")));
			if (existing) {
				mkdirSync(resolve(getResearchXOrgsDir(home), existing.org_uuid), { recursive: true });
				return existing;
			}
		} catch {
			// An existing invalid manifest is replaced atomically below.
		}
		writeActiveOrgAtomic(path, org);
	}
	mkdirSync(resolve(getResearchXOrgsDir(home), org.org_uuid), { recursive: true });
	return org;
}

export function getResearchXActiveOrgDir(home = getResearchXHome()): string {
	return resolve(getResearchXOrgsDir(home), ensureResearchXActiveOrg(home).org_uuid);
}

export function getResearchXOrgDatabasePath(home = getResearchXHome()): string {
	return resolve(getResearchXActiveOrgDir(home), "researchx-workbench.db");
}

export function ensureResearchXHome(home = getResearchXHome()): void {
	for (const dir of [
		home,
		getResearchXOrgsDir(home),
		getResearchXActiveOrgDir(home),
		getResearchXAgentDir(home),
		getResearchXMemoryDir(home),
		getResearchXStateDir(home),
		getDefaultSessionDir(home),
	]) {
		mkdirSync(dir, { recursive: true });
	}
}
