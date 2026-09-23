import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);

export const KAGGLE_POLL_MINUTES_DEFAULT = 10;
const KAGGLE_MAX_POLLS_DEFAULT = 18;

export interface KaggleAuth {
	username: string;
	key: string;
	source: string;
}

/** Resolve Kaggle credentials: env first, then ~/.kaggle/kaggle.json. Never throws. */
export function resolveKaggleAuth(env: NodeJS.ProcessEnv = process.env): KaggleAuth | { error: string } {
	const username = env.KAGGLE_USERNAME?.trim();
	const key = env.KAGGLE_KEY?.trim();
	if (username && key) return { username, key, source: "env" };
	try {
		const raw = readFileSync(join(homedir(), ".kaggle", "kaggle.json"), "utf8");
		const parsed = JSON.parse(raw) as { username?: unknown; key?: unknown };
		if (typeof parsed.username === "string" && typeof parsed.key === "string" && parsed.username && parsed.key) {
			return { username: parsed.username, key: parsed.key, source: "~/.kaggle/kaggle.json" };
		}
	} catch {
		// Fall through to the setup error below.
	}
	return {
		error:
			"Kaggle credentials not found. Set KAGGLE_USERNAME + KAGGLE_KEY, or run `pip install kaggle` and place your token at ~/.kaggle/kaggle.json (kaggle.com → Settings → API → Create New Token).",
	};
}

export function kaggleEnv(auth: KaggleAuth): NodeJS.ProcessEnv {
	return { ...process.env, KAGGLE_USERNAME: auth.username, KAGGLE_KEY: auth.key };
}

export interface KaggleRun {
	stdout: string;
	stderr: string;
}

export async function runKaggle(
	args: string[],
	auth: KaggleAuth,
	timeoutMs: number,
	kaggleBin = "kaggle",
): Promise<KaggleRun> {
	try {
		const result = await execFileAsync(kaggleBin, args, {
			env: kaggleEnv(auth),
			timeout: timeoutMs,
			maxBuffer: 8 * 1024 * 1024,
		});
		return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
	} catch (error) {
		const err = error as { code?: unknown; stdout?: unknown; stderr?: unknown; message?: string };
		if (err.code === "ENOENT") {
			throw new Error("The `kaggle` CLI is not installed. Run `pip install kaggle` first.");
		}
		const detail = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
		throw new Error(detail || err.message || "kaggle command failed");
	}
}

const TERMINAL_STATES = ["complete", "error", "cancelled", "failed"] as const;

/** Parse `kaggle kernels status` output into a normalized state. */
export function parseKernelStatus(output: string): string {
	const lowered = output.toLowerCase();
	for (const state of TERMINAL_STATES) {
		if (lowered.includes(state)) return state;
	}
	if (lowered.includes("running")) return "running";
	if (lowered.includes("queued")) return "queued";
	return "unknown";
}

export function isTerminalState(state: string): boolean {
	return (TERMINAL_STATES as readonly string[]).includes(state);
}

export function fullSlug(slug: string, username: string): string {
	return slug.includes("/") ? slug : `${username}/${slug}`;
}

export interface KernelMetadata {
	id: string;
	title: string;
	code_file: string;
	language: string;
	kernel_type: string;
	enable_gpu: boolean;
	enable_internet: boolean;
}

/** Write kernel-metadata.json into dir (creates it). Returns the full slug. */
export function writeKernelMetadata(dir: string, options: {
	owner: string;
	slug?: string;
	title?: string;
	codeFile: string;
	gpu?: boolean;
}): string {
	mkdirSync(dir, { recursive: true });
	const stem = (options.slug ?? options.title ?? basename(options.codeFile).replace(/\.[^.]+$/, "") ?? "experiment")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 50) || "experiment";
	const metadata: KernelMetadata = {
		id: `${options.owner}/${stem}`,
		title: options.title ?? stem,
		code_file: basename(options.codeFile),
		language: "python",
		kernel_type: "script",
		enable_gpu: options.gpu ?? true,
		enable_internet: true,
	};
	writeFileSync(join(dir, "kernel-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
	return metadata.id;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function requireAuth(): KaggleAuth {
	const auth = resolveKaggleAuth();
	if ("error" in auth) throw new Error(auth.error);
	return auth;
}

export function registerKaggleTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "researchx_kaggle_push",
		label: "ResearchX Kaggle Push",
		description:
			"Push a local experiment directory to Kaggle Kernels (writes kernel-metadata.json when missing). Returns the kernel slug. Experiments are always written locally first, then pushed.",
		parameters: Type.Object({
			dir: Type.String({ description: "Local kernel source directory containing the experiment script." }),
			file: Type.Optional(Type.String({ description: "Entry script filename inside dir (default: first .py file)." })),
			title: Type.Optional(Type.String({ description: "Kernel title (also used for the slug)." })),
			slug: Type.Optional(Type.String({ description: "Explicit kernel slug (without owner prefix)." })),
			gpu: Type.Optional(Type.Boolean({ description: "Request a GPU kernel (default true)." })),
		}),
		async execute(_toolCallId, params): Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }> {
			const auth = requireAuth();
			const dir = resolve(params.dir as string);
			if (!existsSync(dir)) {
				return { content: [{ type: "text", text: `Directory not found: ${dir}` }], details: {} };
			}
			let codeFile = params.file as string | undefined;
			if (!codeFile) {
				const py = readdirSync(dir).find((entry) => entry.endsWith(".py"));
				if (!py) {
					return { content: [{ type: "text", text: `No .py entry script found in ${dir}. Pass "file" explicitly.` }], details: {} };
				}
				codeFile = py;
			}
			if (!existsSync(join(dir, codeFile))) {
				return { content: [{ type: "text", text: `Entry script not found: ${join(dir, codeFile)}` }], details: {} };
			}
			const slug = writeKernelMetadata(dir, {
				owner: auth.username,
				slug: params.slug as string | undefined,
				title: params.title as string | undefined,
				codeFile,
				gpu: (params.gpu as boolean | undefined) ?? true,
			});
			const run = await runKaggle(["kernels", "push", "-p", dir], auth, 300_000);
			const text = [`Pushed ${slug}`, run.stdout, run.stderr].filter(Boolean).join("\n");
			return { content: [{ type: "text", text }], details: { slug } };
		},
	});

	pi.registerTool({
		name: "researchx_kaggle_status",
		label: "ResearchX Kaggle Status",
		description: "Check the execution status of a Kaggle kernel (running, queued, complete, error, cancelled).",
		parameters: Type.Object({
			slug: Type.String({ description: "Kernel slug, with or without the owner prefix." }),
		}),
		async execute(_toolCallId, params): Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }> {
			const auth = requireAuth();
			const slug = fullSlug(params.slug as string, auth.username);
			const run = await runKaggle(["kernels", "status", slug], auth, 60_000);
			const state = parseKernelStatus(`${run.stdout}\n${run.stderr}`);
			return { content: [{ type: "text", text: `${slug}: ${state}\n${run.stdout}`.trim() }], details: { slug, state } };
		},
	});

	pi.registerTool({
		name: "researchx_kaggle_output",
		label: "ResearchX Kaggle Output",
		description: "Download a finished Kaggle kernel's output files into outputs/kaggle/<slug>/ and list them.",
		parameters: Type.Object({
			slug: Type.String({ description: "Kernel slug, with or without the owner prefix." }),
			outDir: Type.Optional(Type.String({ description: "Download directory (default outputs/kaggle/<slug>/)." })),
		}),
		async execute(_toolCallId, params): Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }> {
			const auth = requireAuth();
			const slug = fullSlug(params.slug as string, auth.username);
			const outDir = resolve((params.outDir as string | undefined) ?? join(process.cwd(), "outputs", "kaggle", slug.replace("/", "__")));
			mkdirSync(outDir, { recursive: true });
			const run = await runKaggle(["kernels", "output", slug, "-p", outDir], auth, 300_000);
			const files = readdirSync(outDir);
			const text = [
				`Downloaded ${files.length} file(s) from ${slug} to ${outDir}`,
				...files.map((file) => `  - ${file}`),
				run.stderr ? `notes: ${run.stderr}` : "",
			].filter(Boolean).join("\n");
			return { content: [{ type: "text", text }], details: { slug, outDir, files } };
		},
	});

	pi.registerTool({
		name: "researchx_kaggle_experiment",
		label: "ResearchX Kaggle Experiment",
		description:
			"Run a full Kaggle experiment: push the local experiment directory, then poll status every N minutes (default 10) until it completes, fails, or the poll budget runs out; finally download outputs. This is the default way to run experiments — local first, Kaggle for execution, monitored until done.",
		promptGuidelines: [
			"Use this for every experiment run unless the user explicitly says local-only.",
			"Write all experiment code locally first (outputs/experiments/<slug>/), then run it through this tool.",
			"Report the kernel URL, final state, and downloaded artifact paths when it finishes.",
		],
		parameters: Type.Object({
			dir: Type.String({ description: "Local experiment directory to push." }),
			title: Type.Optional(Type.String({ description: "Experiment title." })),
			gpu: Type.Optional(Type.Boolean({ description: "Request a GPU kernel (default true)." })),
			pollMinutes: Type.Optional(Type.Number({ description: "Minutes between status checks (default 10)." })),
			maxPolls: Type.Optional(Type.Number({ description: "Maximum status checks before giving up (default 18)." })),
		}),
		async execute(_toolCallId, params, _signal, onUpdate): Promise<{ content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }> {
			const auth = requireAuth();
			const dir = resolve(params.dir as string);
			if (!existsSync(dir)) {
				return { content: [{ type: "text", text: `Directory not found: ${dir}` }], details: {} };
			}
			const py = readdirSync(dir).find((entry) => entry.endsWith(".py"));
			if (!py) {
				return { content: [{ type: "text", text: `No .py entry script found in ${dir}.` }], details: {} };
			}
			const slug = writeKernelMetadata(dir, {
				owner: auth.username,
				title: (params.title as string | undefined) ?? basename(dir),
				codeFile: py,
				gpu: (params.gpu as boolean | undefined) ?? true,
			});
			const progress = (message: string): void => {
				try {
					onUpdate?.({ content: [{ type: "text", text: message }], details: { slug } });
				} catch {
					// Progress updates are best-effort during long polls.
				}
			};
			progress(`Pushed ${slug} — monitoring every ${params.pollMinutes ?? KAGGLE_POLL_MINUTES_DEFAULT} min.`);
			await runKaggle(["kernels", "push", "-p", dir], auth, 300_000);
			const pollMinutes = Math.max(1, (params.pollMinutes as number | undefined) ?? KAGGLE_POLL_MINUTES_DEFAULT);
			const maxPolls = Math.max(1, Math.min((params.maxPolls as number | undefined) ?? KAGGLE_MAX_POLLS_DEFAULT, 72));
			let state = "queued";
			for (let poll = 1; poll <= maxPolls; poll += 1) {
				await sleep(pollMinutes * 60_000);
				try {
					const run = await runKaggle(["kernels", "status", slug], auth, 60_000);
					state = parseKernelStatus(`${run.stdout}\n${run.stderr}`);
				} catch (error) {
					progress(`Status check ${poll}/${maxPolls} failed: ${error instanceof Error ? error.message : String(error)}`);
					continue;
				}
				progress(`[${slug}] poll ${poll}/${maxPolls}: ${state}`);
				if (isTerminalState(state)) break;
			}
			const outDir = resolve(process.cwd(), "outputs", "kaggle", slug.replace("/", "__"));
			let files: string[] = [];
			if (state === "complete") {
				mkdirSync(outDir, { recursive: true });
				await runKaggle(["kernels", "output", slug, "-p", outDir], auth, 300_000);
				files = readdirSync(outDir);
			}
			const summary = [
				`Experiment ${slug}: ${state}`,
				`Kernel: https://www.kaggle.com/code/${slug}`,
				state === "complete"
					? `Outputs (${files.length} files) in ${outDir}`
					: "No outputs downloaded (kernel did not complete). Re-run status/output checks later or raise maxPolls.",
			].join("\n");
			return { content: [{ type: "text", text: summary }], details: { slug, state, outDir, files } };
		},
	});
}
