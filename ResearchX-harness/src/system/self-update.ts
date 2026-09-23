export const RESEARCHX_PACKAGE_NAME = "researchx";
const REGISTRY_LATEST_URL = `https://registry.npmjs.org/${RESEARCHX_PACKAGE_NAME}/latest`;

function parseVersion(version: string): number[] | undefined {
	const match = version.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!match) return undefined;
	return [Number.parseInt(match[1]!, 10), Number.parseInt(match[2]!, 10), Number.parseInt(match[3]!, 10)];
}

export function isNewerVersion(candidate: string, current: string): boolean {
	const parsedCandidate = parseVersion(candidate);
	const parsedCurrent = parseVersion(current);
	if (!parsedCandidate || !parsedCurrent) return false;
	for (let index = 0; index < 3; index += 1) {
		if (parsedCandidate[index]! !== parsedCurrent[index]!) {
			return parsedCandidate[index]! > parsedCurrent[index]!;
		}
	}
	return false;
}

export async function fetchLatestResearchXVersion(timeoutMs = 5000): Promise<string | undefined> {
	try {
		const response = await fetch(REGISTRY_LATEST_URL, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!response.ok) return undefined;
		const data = (await response.json()) as { version?: unknown };
		return typeof data.version === "string" && parseVersion(data.version) ? data.version : undefined;
	} catch {
		return undefined;
	}
}

export function getResearchXUpgradeLines(
	latestVersion: string,
	currentVersion: string,
	options: { standaloneBundle: boolean; platform?: NodeJS.Platform },
): string[] {
	void options.platform;
	const upgradeCommand = options.standaloneBundle
		? "Download the latest release from https://github.com/chandan11248/ResearchX-harness/releases"
		: `npm install -g ${RESEARCHX_PACKAGE_NAME}`;
	return [
		`A newer ResearchX is available: ${latestVersion} (installed ${currentVersion}).`,
		`Update the CLI itself with: ${upgradeCommand}`,
	];
}
