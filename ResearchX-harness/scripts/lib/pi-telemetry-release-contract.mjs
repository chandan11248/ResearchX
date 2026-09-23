export const RESEARCHX_PI_TELEMETRY_PACKAGE =
	"@earendil-works/pi-telemetry";
export const RESEARCHX_PI_TELEMETRY_VERSION = "0.84.2";
export const RESEARCHX_PI_TELEMETRY_RESOLVED =
	"https://registry.npmjs.org/@earendil-works/pi-telemetry/-/pi-telemetry-0.84.2.tgz";
export const RESEARCHX_PI_TELEMETRY_INTEGRITY =
	"sha512-wg5caea7uIv1BHRBm2Y116RvFG4oSAiP5qk9tA2463PDGIr4K8M1Ceyyg5DOpF/shUUl0gk826yQJAeAcHYB9g==";

const PI_TELEMETRY_LOCK_PATHS = Object.freeze([
	"node_modules/@earendil-works/pi-telemetry",
	"node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-telemetry",
]);
const PI_TELEMETRY_ARCHIVE_MANIFEST_PATHS = Object.freeze(
	PI_TELEMETRY_LOCK_PATHS.map(
		(packagePath) => `npm/${packagePath}/package.json`,
	),
);

function isPiTelemetryLockPath(packagePath) {
	return (
		packagePath === PI_TELEMETRY_LOCK_PATHS[0] ||
		packagePath.endsWith(
			`/node_modules/${RESEARCHX_PI_TELEMETRY_PACKAGE}`,
		)
	);
}

function verifyExpectedVersion(expectedVersion, fail) {
	if (expectedVersion !== RESEARCHX_PI_TELEMETRY_VERSION) {
		fail(
			`Pi telemetry release contract is pinned to ${RESEARCHX_PI_TELEMETRY_PACKAGE}@${RESEARCHX_PI_TELEMETRY_VERSION}, not ${expectedVersion}`,
		);
	}
}

export function resolvePiTelemetryRuntimeVersion(
	lockedVersion,
	hasRootPackageLock,
) {
	if (!hasRootPackageLock) {
		return RESEARCHX_PI_TELEMETRY_VERSION;
	}
	if (lockedVersion !== RESEARCHX_PI_TELEMETRY_VERSION) {
		throw new Error(
			`Pi telemetry must match the maintained Pi ${RESEARCHX_PI_TELEMETRY_VERSION} train, found ${lockedVersion ?? "missing"}`,
		);
	}
	return lockedVersion;
}

function verifyPiTelemetryLockEntry(entry, packagePath, canonicalIntegrity, fail) {
	const observedIntegrity =
		entry?.integrity === undefined
			? canonicalIntegrity
			: entry.integrity;
	if (
		entry?.version !== RESEARCHX_PI_TELEMETRY_VERSION ||
		entry?.resolved !== RESEARCHX_PI_TELEMETRY_RESOLVED ||
		(entry?.name !== undefined &&
			entry.name !== RESEARCHX_PI_TELEMETRY_PACKAGE) ||
		observedIntegrity !== RESEARCHX_PI_TELEMETRY_INTEGRITY
	) {
		fail(
			`committed runtime lock does not resolve exact ${RESEARCHX_PI_TELEMETRY_PACKAGE}@${RESEARCHX_PI_TELEMETRY_VERSION} at ${packagePath}`,
		);
	}
}

export function verifyPiTelemetryRuntimeLockContract(
	runtimeLock,
	expectedVersion,
	fail,
) {
	verifyExpectedVersion(expectedVersion, fail);
	if (
		runtimeLock.packages?.[""]?.dependencies?.[
			RESEARCHX_PI_TELEMETRY_PACKAGE
		] !== RESEARCHX_PI_TELEMETRY_VERSION
	) {
		fail(
			`committed runtime lock does not directly pin ${RESEARCHX_PI_TELEMETRY_PACKAGE}@${RESEARCHX_PI_TELEMETRY_VERSION}`,
		);
	}
	const packages = Object.entries(runtimeLock.packages ?? {}).filter(
		([packagePath]) => isPiTelemetryLockPath(packagePath),
	);
	const expectedPaths = new Set(PI_TELEMETRY_LOCK_PATHS);
	for (const [packagePath] of packages) {
		if (!expectedPaths.has(packagePath)) {
			fail(
				`committed runtime lock has unapproved Pi telemetry placement: ${packagePath}`,
			);
		}
	}
	for (const packagePath of expectedPaths) {
		if (!packages.some(([observedPath]) => observedPath === packagePath)) {
			fail(`committed runtime lock is missing Pi telemetry placement: ${packagePath}`);
		}
	}
	const canonicalIntegrity =
		runtimeLock.packages?.[PI_TELEMETRY_LOCK_PATHS[0]]?.integrity;
	if (canonicalIntegrity !== RESEARCHX_PI_TELEMETRY_INTEGRITY) {
		fail(
			`committed runtime lock does not bind ${RESEARCHX_PI_TELEMETRY_PACKAGE}@${RESEARCHX_PI_TELEMETRY_VERSION} to the reviewed npm integrity`,
		);
	}
	for (const [packagePath, entry] of packages) {
		verifyPiTelemetryLockEntry(
			entry,
			packagePath,
			canonicalIntegrity,
			fail,
		);
	}
}

export function verifyPiTelemetryArchiveContract(
	readArchivedJson,
	expectedVersion,
	fail,
) {
	verifyExpectedVersion(expectedVersion, fail);
	verifyPiTelemetryRuntimeLockContract(
		readArchivedJson("npm/package-lock.json"),
		expectedVersion,
		fail,
	);
	for (const entryPath of PI_TELEMETRY_ARCHIVE_MANIFEST_PATHS) {
		const manifest = readArchivedJson(entryPath);
		if (
			manifest?.name !== RESEARCHX_PI_TELEMETRY_PACKAGE ||
			manifest?.version !== RESEARCHX_PI_TELEMETRY_VERSION
		) {
			fail(
				`runtime archive ${entryPath} is not exact ${RESEARCHX_PI_TELEMETRY_PACKAGE}@${RESEARCHX_PI_TELEMETRY_VERSION}`,
			);
		}
	}
}
