import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { checkpointsPath, registerHumanCheckpointTools } from "../extensions/research-tools/human-checkpoint.js";

type Tool = {
	execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{
		content: Array<{ type: string; text: string }>;
		details: { ok?: boolean; checkpoint?: { id: string; status: string; decidedBy?: string }; approvedForArtifact?: boolean; checkpoints?: Array<{ id: string; status: string }> };
	}>;
	name: string;
};

const originalCwd = process.cwd();

afterEach(() => {
	process.chdir(originalCwd);
});

function registerTool(): Tool {
	const tools = new Map<string, Tool>();
	registerHumanCheckpointTools({
		registerTool(tool: Tool) {
			tools.set(tool.name, tool);
		},
	} as never);
	const tool = tools.get("researchx_human_checkpoint");
	assert.ok(tool, "expected researchx_human_checkpoint to be registered");
	return tool;
}

function withTempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "rx-checkpoints-"));
	process.chdir(root);
	return root;
}

test("request creates a persisted pending checkpoint and status reports it", async () => {
	withTempProject();
	const tool = registerTool();
	const requested = await tool.execute("t1", { action: "request", artifact: "papers/demo.md", summary: "Final draft for approval" });
	assert.equal(requested.details.ok, true);
	const id = requested.details.checkpoint?.id;
	assert.ok(id?.startsWith("cp-"));

	const ledger = JSON.parse(readFileSync(checkpointsPath(), "utf8")) as { schema: string; checkpoints: Array<{ status: string }> };
	assert.equal(ledger.schema, "researchx.humanCheckpoints.v1");
	assert.equal(ledger.checkpoints[0]?.status, "pending");

	const status = await tool.execute("t2", { action: "status", artifact: "papers/demo.md" });
	assert.equal(status.details.approvedForArtifact, false);
	assert.equal(status.details.checkpoints?.[0]?.id, id);
});

test("record persists an immutable human decision and gates the artifact", async () => {
	withTempProject();
	const tool = registerTool();
	const requested = await tool.execute("t1", { action: "request", artifact: "papers/demo.md", summary: "Final draft" });
	const id = requested.details.checkpoint!.id;

	const missing = await tool.execute("t2", { action: "record", checkpointId: id, decision: "approved" });
	assert.equal(missing.details.ok, false);

	const recorded = await tool.execute("t3", { action: "record", checkpointId: id, decision: "approved", decidedBy: "Radhe", note: "looks good" });
	assert.equal(recorded.details.ok, true);
	assert.equal(recorded.details.checkpoint?.status, "approved");
	assert.equal(recorded.details.checkpoint?.decidedBy, "Radhe");

	const again = await tool.execute("t4", { action: "record", checkpointId: id, decision: "rejected", decidedBy: "Radhe" });
	assert.equal(again.details.ok, false);

	const status = await tool.execute("t5", { action: "status", artifact: "papers/demo.md" });
	assert.equal(status.details.approvedForArtifact, true);
	assert.ok(status.content[0]?.text.includes('Approved for "papers/demo.md": YES'));
});

test("reject path records rejection and blocks the artifact", async () => {
	withTempProject();
	const tool = registerTool();
	const requested = await tool.execute("t1", { action: "request", artifact: "outputs/report.md", summary: "Draft report" });
	const id = requested.details.checkpoint!.id;
	await tool.execute("t2", { action: "record", checkpointId: id, decision: "rejected", decidedBy: "Reviewer", note: "fix table 2" });
	const status = await tool.execute("t3", { action: "status", artifact: "outputs/report.md" });
	assert.equal(status.details.approvedForArtifact, false);
	assert.ok(status.content[0]?.text.includes("rejected"));
});

test("record requires an existing checkpoint id", async () => {
	withTempProject();
	const tool = registerTool();
	const missing = await tool.execute("t1", { action: "record", checkpointId: "cp-does-not-exist", decision: "approved", decidedBy: "Radhe" });
	assert.equal(missing.details.ok, false);
	assert.ok(missing.content[0]?.text.includes("no checkpoint"));
});
