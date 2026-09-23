import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Citation integrity tool: verify that cited references actually exist and match
 * what the draft claims about them, using free verification sources (Crossref,
 * Semantic Scholar). Serves the core job "verifying claims against sources" and
 * gives the verifier/skeptic flows a deterministic, provenance-friendly record.
 */

const VERIFY_SCHEMA = "researchx.citationVerification.v1";
const DEFAULT_TIMEOUT_MS = 15_000;
const VERIFIED_SIMILARITY = 0.85;
const CROSSREF_CANDIDATE_ROWS = 3;
const S2_SEARCH_LIMIT = 3;

type ReferenceKind = "doi" | "arxiv" | "title";

type ParsedReference = {
	claimed: string;
	kind: ReferenceKind;
	value: string;
	claimedYear?: number;
};

type ProviderRecord = {
	provider: "crossref" | "semantic-scholar";
	status: "ok" | "not-found" | "error";
	title?: string;
	year?: number;
	doi?: string;
	url?: string;
	similarity?: number;
	error?: string;
};

type ReferenceResult = {
	claimed: string;
	kind: ReferenceKind;
	verdict: "verified" | "mismatch" | "not-found" | "error";
	providers: ProviderRecord[];
};

export function normalizeTitle(value: string): string {
	return value
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Deterministic Jaccard word overlap; titles are short so this is sufficient. */
export function titleSimilarity(a: string, b: string): number {
	const left = new Set(normalizeTitle(a).split(" ").filter(Boolean));
	const right = new Set(normalizeTitle(b).split(" ").filter(Boolean));
	if (left.size === 0 || right.size === 0) return 0;
	let intersection = 0;
	for (const token of left) {
		if (right.has(token)) intersection += 1;
	}
	const jaccard = intersection / (left.size + right.size - intersection);
	// Jaccard ignores word order: "Attention Is All You Need" and "Is Attention All
	// You Need?" are different papers with identical token sets. Combine with a
	// character-level Levenshtein ratio and take the stricter of the two so a
	// reordered or partially-swapped title cannot pass as a 100% match.
	const levenshtein = 1 - editDistance(normalizeTitle(a), normalizeTitle(b)) / Math.max(normalizeTitle(a).length, normalizeTitle(b).length, 1);
	return Math.min(jaccard, levenshtein);
}

function editDistance(a: string, b: string): number {
	if (a === b) return 0;
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i += 1) {
		const current = [i];
		for (let j = 1; j <= b.length; j += 1) {
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		previous = current;
	}
	return previous[b.length];
}

export function parseReference(raw: string): ParsedReference {
	const claimed = raw.trim().replace(/^["']|["']$/g, "");
	const yearMatch = claimed.match(/\b(19|20)\d{2}\b/);
	const claimedYear = yearMatch ? Number(yearMatch[0]) : undefined;

	const doiFromUrl = claimed.match(/doi\.org\/(10\.\d{4,9}\/\S+)/i);
	const doiMatch = claimed.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
	if (doiFromUrl) {
		return { claimed, kind: "doi", value: doiFromUrl[1].replace(/[.,;)]+$/, ""), claimedYear };
	}
	if (doiMatch) {
		return { claimed, kind: "doi", value: doiMatch[0].replace(/[.,;)]+$/, ""), claimedYear };
	}

	const arxivMatch = claimed.match(/arxiv[:\s/]*([a-z-]+\/\d{7}|\d{4}\.\d{4,5})(v\d+)?/i);
	if (arxivMatch) {
		return { claimed, kind: "arxiv", value: arxivMatch[1], claimedYear };
	}

	return { claimed, kind: "title", value: claimed, claimedYear };
}

function yearAgrees(claimedYear: number | undefined, foundYear: number | undefined): boolean {
	if (claimedYear === undefined || foundYear === undefined) return true;
	return Math.abs(claimedYear - foundYear) <= 1;
}

async function fetchJson(url: string, timeoutMs: number): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
	// Verification providers sit behind shared unauthenticated pools (429 is common
	// on Semantic Scholar and bursty on Crossref), so retry a 429 exactly once.
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: { accept: "application/json", "user-agent": "ResearchX-citation-integrity/1.0 (research verification)" },
				signal: AbortSignal.timeout(timeoutMs),
			});
			if (response.status === 429 && attempt === 0) {
				await new Promise((resolve) => setTimeout(resolve, 900));
				continue;
			}
			if (!response.ok) {
				return { ok: false, status: response.status, error: `HTTP ${response.status}` };
			}
			return { ok: true, body: (await response.json()) as unknown };
		} catch (error) {
			if (attempt === 1) {
				return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
			}
		}
	}
	return { ok: false, status: 0, error: "unreachable" };
}

function providerOutcome(
	provider: ProviderRecord["provider"],
	response: { ok: true } | { ok: false; status: number; error: string },
): ProviderRecord {
	if (response.ok) return { provider, status: "ok" };
	// 404 from a verification provider means "reference does not exist there", not "provider failed".
	if (response.status === 404) return { provider, status: "not-found" };
	return { provider, status: "error", error: response.error };
}

function bestCandidate<T>(
	candidates: Array<{ title: string; year?: number; doi?: string; url?: string } & T>,
	reference: ParsedReference,
): (T & { title: string; year?: number; similarity: number }) | undefined {
	let best: (T & { title: string; year?: number; similarity: number }) | undefined;
	for (const candidate of candidates) {
		const similarity = titleSimilarity(reference.value, candidate.title);
		if (!best || similarity > best.similarity) {
			best = { ...candidate, similarity };
		}
	}
	return best;
}

type CrossrefMessage = {
	title?: string[];
	issued?: { "date-parts"?: number[][] };
	DOI?: string;
	URL?: string;
};

async function checkCrossref(reference: ParsedReference, contactEmail: string | undefined, timeoutMs: number): Promise<ProviderRecord> {
	const mailto = contactEmail ? `?mailto=${encodeURIComponent(contactEmail)}` : "";
	const url =
		reference.kind === "doi"
			? `https://api.crossref.org/works/${encodeURIComponent(reference.value)}${mailto}`
			: `https://api.crossref.org/works${mailto ? `${mailto}&` : "?"}query.bibliographic=${encodeURIComponent(reference.value)}&rows=${CROSSREF_CANDIDATE_ROWS}&select=DOI,title,issued,URL`;
	const response = await fetchJson(url, timeoutMs);
	if (!response.ok) {
		return providerOutcome("crossref", response);
	}
	const message = (response.body as { message?: CrossrefMessage & { items?: CrossrefMessage[] } }).message;
	const items = reference.kind === "doi" ? [message as CrossrefMessage] : (message?.items ?? []);
	const candidates = items
		.filter((item) => Array.isArray(item.title) && item.title[0])
		.map((item) => ({
			title: item.title![0],
			year: item.issued?.["date-parts"]?.[0]?.[0],
			doi: item.DOI,
			url: item.URL,
		}));
	if (candidates.length === 0) {
		return { provider: "crossref", status: "not-found" };
	}
	const best = bestCandidate(candidates, reference);
	return {
		provider: "crossref",
		status: "ok",
		title: best!.title,
		year: best!.year,
		doi: best!.doi,
		url: best!.url,
		similarity: best!.similarity,
	};
}

type S2Paper = {
	title?: string;
	year?: number;
	venue?: string;
	url?: string;
	externalIds?: { DOI?: string };
};

async function checkSemanticScholar(reference: ParsedReference, timeoutMs: number): Promise<ProviderRecord> {
	const fields = "fields=title,year,venue,url,externalIds";
	const url =
		reference.kind === "doi"
			? `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(reference.value)}?${fields}`
			: reference.kind === "arxiv"
				? `https://api.semanticscholar.org/graph/v1/paper/arXiv:${encodeURIComponent(reference.value)}?${fields}`
				: `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(reference.value)}&limit=${S2_SEARCH_LIMIT}&${fields}`;
	const response = await fetchJson(url, timeoutMs);
	if (!response.ok) {
		// Semantic Scholar enforces a shared unauthenticated rate pool; 429 is expected under load.
		return providerOutcome("semantic-scholar", response);
	}
	const body = response.body as (S2Paper & { data?: S2Paper[] }) | undefined;
	const papers = reference.kind === "title" ? (body?.data ?? []) : body?.title ? [body] : [];
	const candidates = papers
		.filter((paper) => paper.title)
		.map((paper) => ({
			title: paper.title!,
			year: paper.year,
			doi: paper.externalIds?.DOI,
			url: paper.url,
		}));
	if (candidates.length === 0) {
		return { provider: "semantic-scholar", status: "not-found" };
	}
	const best = bestCandidate(candidates, reference);
	return {
		provider: "semantic-scholar",
		status: "ok",
		title: best!.title,
		year: best!.year,
		doi: best!.doi,
		url: best!.url,
		similarity: best!.similarity,
	};
}

function assembleVerdict(records: ProviderRecord[], reference: ParsedReference): ReferenceResult["verdict"] {
	const okRecords = records.filter((record) => record.status === "ok");
	if (okRecords.length === 0) {
		return records.some((record) => record.status === "error") ? "error" : "not-found";
	}
	const yearOk = okRecords.some((record) => yearAgrees(reference.claimedYear, record.year));
	if (reference.kind === "title") {
		const verified = okRecords.some((record) => (record.similarity ?? 0) >= VERIFIED_SIMILARITY) && yearOk;
		return verified ? "verified" : "mismatch";
	}
	// Resolved identifiers (DOI/arXiv): existence plus year agreement is verification.
	// The resolved title is returned in the record so the caller still checks that the
	// source says what the claim needs (meaning, not just existence).
	return yearOk ? "verified" : "mismatch";
}

export function registerCitationIntegrityTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "researchx_verify_citations",
		label: "Verify Citations",
		description:
			"Verify that cited references exist and match their claimed metadata (title, year) against Crossref and Semantic Scholar. " +
			"Accepts DOIs, arXiv IDs, URLs, or titles. Returns a per-reference verdict (verified / mismatch / not-found / error) " +
			"with the closest candidate found. Use before finalizing any draft that contains citations.",
		parameters: Type.Object({
			references: Type.Array(Type.String({ description: "A DOI, arXiv ID, https://doi.org URL, or paper title (year optional)." }), {
				description: "References to verify, one entry per cited source.",
				minItems: 1,
			}),
			contactEmail: Type.Optional(
				Type.String({ description: "Contact email for Crossref polite-pool requests. Never stored; used only for this call." }),
			),
			timeoutMs: Type.Optional(Type.Number({ description: "Per-request timeout in milliseconds. Default 15000." })),
		}),
		promptSnippet:
			"Use for citation integrity before finalizing a draft. Pass every cited reference; treat 'mismatch' and 'not-found' verdicts as blocking.",
		execute: async (_toolCallId, params) => {
			const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			const parsed = params.references.map(parseReference);
			const results: ReferenceResult[] = await Promise.all(
				parsed.map(async (reference) => {
					const [crossref, semanticScholar] = await Promise.all([
						checkCrossref(reference, params.contactEmail, timeoutMs),
						checkSemanticScholar(reference, timeoutMs),
					]);
					const providers = [crossref, semanticScholar];
					return { claimed: reference.claimed, kind: reference.kind, verdict: assembleVerdict(providers, reference), providers };
				}),
			);
			const counts: Record<string, number> = { verified: 0, mismatch: 0, "not-found": 0, error: 0 };
			for (const result of results) counts[result.verdict] += 1;

			const lines = [
				`Citation verification (${VERIFY_SCHEMA}): ${results.length} reference(s) checked against Crossref + Semantic Scholar.`,
				`Verdicts: ${counts.verified} verified, ${counts.mismatch} mismatch, ${counts["not-found"]} not-found, ${counts.error} error.`,
				"",
			];
			for (const result of results) {
				lines.push(`- [${result.verdict.toUpperCase()}] ${result.claimed} (parsed as ${result.kind})`);
				for (const record of result.providers) {
					if (record.status === "ok") {
						lines.push(
							`    ${record.provider}: "${record.title}"${record.year ? ` (${record.year})` : ""} similarity=${((record.similarity ?? 0) * 100).toFixed(0)}%${record.doi ? ` doi=${record.doi}` : ""}`,
						);
					} else {
						lines.push(`    ${record.provider}: ${record.status}${record.error ? ` (${record.error})` : ""}`);
					}
				}
			}
			lines.push(
				"",
				"Blocking rule: treat mismatch and not-found as unresolved. Fix the reference, replace it, or remove the claim before the draft can pass the human checkpoint.",
			);
			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: { schema: VERIFY_SCHEMA, checkedAt: new Date().toISOString(), counts, results },
			};
		},
	});
}
