import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const RESEARCHX_VERSION = (() => {
	try {
		const pkg = JSON.parse(readFileSync(resolvePath(APP_ROOT, "package.json"), "utf8")) as { version?: string };
		return pkg.version ?? "dev";
	} catch {
		return "dev";
	}
})();

export { RESEARCHX_ASCII_LOGO as RESEARCHX_AGENT_LOGO } from "../../logo.mjs";
