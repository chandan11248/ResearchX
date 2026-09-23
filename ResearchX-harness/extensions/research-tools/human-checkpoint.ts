import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Human checkpoint tool: a persisted approval gate for research outputs.
 * Architecture contract (architecture.md, Integrity layer): the human checkpoint
 * is mandatory and must be a persisted state transition, not agent output. The
 * ledger lives in the project at outputs/checkpoints.json so it ships with the
 * research artifacts it gates.
 *
 * The `record` action must only be called after the human explicitly states the
 * decision in chat. The agent cannot self-approve: the record requires the
 * human's stated reviewer identity and the prompt contract in prompts/skeptic.md
 * and prompts/draft.md makes bypassing the gate a blocking violation.
 */

const LEDGER_SCHEMA = "researchx.humanCheckpoints.v1";
const LEDGER_DIR = "outputs";
const LEDGER_FILE = "checkpoints.json";

type CheckpointStatus = "pending" | "approved" | "rejected";

type CheckpointRecord = {
	id: string;
	createdAt: string;
	artifact: string;
	summary: string;
	status: CheckpointStatus;
	decidedAt?: string;
	decidedBy?: string;
	note?: string;
};

type CheckpointLedger = {
	schema: typeof LEDGER_SCHEMA;
	checkpoints: CheckpointRecord[];
};

export function checkpointsPath(cwd: string = process.cwd()): string {
	return resolve(cwd, LEDGER_DIR, LEDGER_FILE);
}

function readLedger(cwd: string): CheckpointLedger {
	const path = checkpointsPath(cwd);
	if (!existsSync(path)) {
		return { schema: LEDGER_SCHEMA, checkpoints: [] };
	}
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (
			parsed &&
			typeof parsed === "object" &&
			(parsed as CheckpointLedger).schema === LEDGER_SCHEMA &&
			Array.isArray((parsed as CheckpointLedger).checkpoints)
		) {
			return parsed as CheckpointLedger;
		}
		return { schema: LEDGER_SCHEMA, checkpoints: [] };
	} catch {
		return { schema: LEDGER_SCHEMA, checkpoints: [] };
	}
}

function writeLedger(cwd: string, ledger: CheckpointLedger): void {
	const path = checkpointsPath(cwd);
	mkdirSync(resolve(path, ".."), { recursive: true });
	writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function newCheckpointId(now: Date): string {
	return `cp-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function formatRecord(record: CheckpointRecord): string {
	const decision = record.decidedAt
		? `${record.status} by ${record.decidedBy} at ${record.decidedAt}${record.note ? ` — ${record.note}` : ""}`
		: record.status;
	return `- ${record.id} [${record.status}] ${record.artifact} — ${record.summary} (${decision})`;
}

type CheckpointToolResult = {
	content: Array<{ type: "text"; text: string }>;
	details: {
		schema: typeof LEDGER_SCHEMA;
		ok: boolean;
		checkpoint?: CheckpointRecord;
		approvedForArtifact?: boolean;
		checkpoints?: CheckpointRecord[];
	};
};

function textResult(text: string, details: CheckpointToolResult["details"]): CheckpointToolResult {
	return { content: [{ type: "text", text }], details };
}

export function registerHumanCheckpointTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "researchx_human_checkpoint",
		label: "Human Checkpoint",
		description:
			"Persisted human-approval gate for research artifacts. 'request' opens a pending checkpoint for an artifact; " +
			"'status' reports the ledger and whether an artifact is approved; 'record' persists the human's explicit " +
			"approve/reject decision. The record action must only be called after the human explicitly states the decision " +
			"in chat — the agent must never self-approve. A draft without an approved checkpoint is not final output.",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("request"), Type.Literal("status"), Type.Literal("record")], {
				description: "request: open a pending checkpoint. status: read the ledger. record: persist the human's decision.",
			}),
			artifact: Type.Optional(Type.String({ description: "Artifact the checkpoint gates (path or stable id). Required for request." })),
			summary: Type.Optional(Type.String({ description: "What the human is being asked to approve. Required for request." })),
			checkpointId: Type.Optional(Type.String({ description: "Checkpoint id. Required for record; optional filter for status." })),
			decision: Type.Optional(Type.Union([Type.Literal("approved"), Type.Literal("rejected")], { description: "The human's decision. Required for record." })),
			decidedBy: Type.Optional(Type.String({ description: "Who approved/rejected, as stated by the human in chat. Required for record." })),
			note: Type.Optional(Type.String({ description: "Optional decision note (e.g. requested revisions)." })),
		}),
		promptSnippet:
			"Mandatory before calling any draft final: request a checkpoint, surface pending decisions to the human verbatim, and record only their explicit decision. Never self-approve.",
		execute: async (_toolCallId, params): Promise<CheckpointToolResult> => {
			const cwd = process.cwd();
			const ledger = readLedger(cwd);

			if (params.action === "request") {
				if (!params.artifact?.trim() || !params.summary?.trim()) {
					return textResult("Error: 'request' requires both 'artifact' and 'summary'.", { schema: LEDGER_SCHEMA, ok: false });
				}
				const now = new Date();
				const record: CheckpointRecord = {
					id: newCheckpointId(now),
					createdAt: now.toISOString(),
					artifact: params.artifact.trim(),
					summary: params.summary.trim(),
					status: "pending",
				};
				ledger.checkpoints.push(record);
				writeLedger(cwd, ledger);
				return textResult(
					[
						`Human checkpoint requested and persisted to ${LEDGER_DIR}/${LEDGER_FILE}.`,
						formatRecord(record),
						"",
						"Present this decision to the human and stop. The artifact is NOT final until a human decision is recorded.",
					].join("\n"),
					{ schema: LEDGER_SCHEMA, ok: true, checkpoint: record },
				);
			}

			if (params.action === "status") {
				const relevant = params.checkpointId
					? ledger.checkpoints.filter((record) => record.id === params.checkpointId)
					: ledger.checkpoints;
				const artifact = params.artifact?.trim();
				const approvedForArtifact =
					artifact !== undefined
						? ledger.checkpoints.some((record) => record.artifact === artifact && record.status === "approved")
						: undefined;
				const lines = [`Human checkpoint ledger (${LEDGER_SCHEMA}): ${relevant.length} record(s) in ${LEDGER_DIR}/${LEDGER_FILE}.`];
				if (approvedForArtifact !== undefined) {
					lines.push(`Approved for "${artifact}": ${approvedForArtifact ? "YES" : "NO"}`);
				}
				if (relevant.length > 0) lines.push("");
				for (const record of relevant) lines.push(formatRecord(record));
				if (relevant.length === 0) lines.push("(no checkpoints recorded)");
				return textResult(lines.join("\n"), {
					schema: LEDGER_SCHEMA,
					ok: true,
					approvedForArtifact,
					checkpoints: relevant,
				});
			}

			return recordDecision(cwd, ledger, params);
		},
	});
}

type CheckpointParams = {
	action: "request" | "status" | "record";
	artifact?: string;
	summary?: string;
	checkpointId?: string;
	decision?: "approved" | "rejected";
	decidedBy?: string;
	note?: string;
};

function recordDecision(cwd: string, ledger: CheckpointLedger, params: CheckpointParams): CheckpointToolResult {
	if (!params.checkpointId?.trim() || !params.decision || !params.decidedBy?.trim()) {
		return textResult(
			"Error: 'record' requires 'checkpointId', 'decision' (approved|rejected), and 'decidedBy' as explicitly stated by the human in chat.",
			{ schema: LEDGER_SCHEMA, ok: false },
		);
	}
	const record = ledger.checkpoints.find((entry) => entry.id === params.checkpointId!.trim());
	if (!record) {
		return textResult(`Error: no checkpoint with id ${params.checkpointId}. Use the status action to list ids.`, {
			schema: LEDGER_SCHEMA,
			ok: false,
		});
	}
	if (record.status !== "pending") {
		return textResult(
			`Error: checkpoint ${record.id} is already ${record.status} (by ${record.decidedBy}). Decisions are immutable; open a new checkpoint if the artifact changed.`,
			{ schema: LEDGER_SCHEMA, ok: false },
		);
	}
	record.status = params.decision;
	record.decidedAt = new Date().toISOString();
	record.decidedBy = params.decidedBy.trim();
	if (params.note?.trim()) record.note = params.note.trim();
	writeLedger(cwd, ledger);
	return textResult(
		[
			`Decision recorded and persisted to ${LEDGER_DIR}/${LEDGER_FILE}.`,
			formatRecord(record),
			record.status === "approved"
				? "This artifact is now human-approved and may be treated as final output."
				: "This artifact is rejected. Address the note, revise, and open a new checkpoint.",
		].join("\n"),
		{ schema: LEDGER_SCHEMA, ok: true, checkpoint: record },
	);
}
