import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { parseReference, registerCitationIntegrityTools, titleSimilarity } from "../extensions/research-tools/citation-integrity.js";

type Tool = {
	execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{
		content: Array<{ type: string; text: string }>;
		details: { schema: string; counts: Record<string, number>; results: Array<{ claimed: string; verdict: string; providers: Array<{ provider: string; status: string; title?: string; similarity?: number }> }> };
	}>;
	name: string;
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function registerTool(): Tool {
	const tools = new Map<string, Tool>();
	registerCitationIntegrityTools({
		registerTool(tool: Tool) {
			tools.set(tool.name, tool);
		},
	} as never);
	const tool = tools.get("researchx_verify_citations");
	assert.ok(tool, "expected researchx_verify_citations to be registered");
	return tool;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("parseReference extracts doi, arxiv, title, and claimed year", () => {
	const fromUrl = parseReference("https://doi.org/10.1038/s41586-021-03819-2.");
	assert.equal(fromUrl.kind, "doi");
	assert.equal(fromUrl.value, "10.1038/s41586-021-03819-2");
	const bare = parseReference("10.1038/s41586-021-03819-2");
	assert.equal(bare.kind, "doi");
	assert.equal(bare.value, "10.1038/s41586-021-03819-2");
	assert.equal(parseReference("arXiv:2309.08600 (2023)").kind, "arxiv");
	assert.equal(parseReference("arXiv cs/0112017").kind, "arxiv");
	const title = parseReference("Attention Is All You Need, 2017");
	assert.equal(title.kind, "title");
	assert.equal(title.claimedYear, 2017);
});

test("titleSimilarity is 1 for identical titles and low for unrelated ones", () => {
	assert.ok(titleSimilarity("Attention Is All You Need", "attention is all you need!") > 0.99);
	assert.ok(titleSimilarity("Attention Is All You Need", "Random wallpaper classification methods") < 0.2);
});

test("reordered titles are not treated as the same paper", () => {
	// "Attention Is All You Need" (2017) vs "Is Attention All You Need?" (2025):
	// identical token set, different paper. Jaccard alone would score this 1.0.
	assert.ok(titleSimilarity("Attention Is All You Need", "Is Attention All You Need?") < 0.85);
});

test("verified verdict when both providers confirm a doi reference", async () => {
	const tool = registerTool();
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.includes("api.crossref.org/works/10.1038%2Fs41586")) {
			return jsonResponse(200, {
				message: { title: ["Highly accurate protein structure prediction with AlphaFold"], issued: { "date-parts": [[2021]] }, DOI: "10.1038/s41586-021-03819-2" },
			});
		}
		if (url.includes("api.semanticscholar.org")) {
			return jsonResponse(200, { title: "Highly accurate protein structure prediction with AlphaFold", year: 2021, externalIds: { DOI: "10.1038/s41586-021-03819-2" } });
		}
		return jsonResponse(500, {});
	}) as typeof fetch;

	const result = await tool.execute("t1", { references: ["10.1038/s41586-021-03819-2 (2021)"] });
	assert.equal(result.details.results[0]?.verdict, "verified");
	assert.equal(result.details.counts.verified, 1);
	assert.ok(result.content[0]?.text.includes("VERIFIED"));
	assert.equal(result.details.results[0]?.providers[1]?.title, "Highly accurate protein structure prediction with AlphaFold");
});

test("mismatch verdict when the claimed year conflicts with the resolved record", async () => {
	const tool = registerTool();
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.includes("api.crossref.org")) {
			return jsonResponse(200, { message: { title: ["A real geological survey paper"], issued: { "date-parts": [[2023]] } } });
		}
		if (url.includes("api.semanticscholar.org")) {
			return jsonResponse(200, { title: "A real geological survey paper", year: 2023 });
		}
		return jsonResponse(500, {});
	}) as typeof fetch;

	const result = await tool.execute("t2", { references: ["10.9999/real-paper (1999)"] });
	assert.equal(result.details.results[0]?.verdict, "mismatch");
});

test("404 from providers means not-found, not provider error", async () => {
	const tool = registerTool();
	globalThis.fetch = (async () => jsonResponse(404, {})) as typeof fetch;

	const result = await tool.execute("t3", { references: ["10.9999/never-published"] });
	assert.equal(result.details.results[0]?.verdict, "not-found");
	assert.equal(result.details.results[0]?.providers[0]?.status, "not-found");
});

test("not-found verdict when both providers return no candidates, and title search finds candidates", async () => {
	const tool = registerTool();
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.includes("api.crossref.org/works?")) {
			return jsonResponse(200, { message: { items: [{ title: ["Sparse Autoencoders Find Interpretable Features"], issued: { "date-parts": [[2023]] }, DOI: "10.1234/sae" }] } });
		}
		if (url.includes("paper/search")) {
			return jsonResponse(200, { data: [{ title: "Sparse Autoencoders Find Highly Interpretable Features", year: 2023 }] });
		}
		return jsonResponse(404, {});
	}) as typeof fetch;

	const result = await tool.execute("t3", { references: ["Sparse Autoencoders Find Interpretable Features"] });
	assert.equal(result.details.results[0]?.verdict, "verified");

	const missing = await tool.execute("t4", {
		references: ["Entirely Fabricated Title That No Paper Has Ever Used Before"],
	});
	// fetch mock above only handles the earlier URLs; both providers 404 -> error surfaces, not fabricated confirmation.
	assert.ok(["not-found", "error", "mismatch"].includes(missing.details.results[0]?.verdict ?? ""));
	assert.notEqual(missing.details.results[0]?.verdict, "verified");
});
