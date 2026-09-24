import { readdir } from "node:fs/promises";
import { cpus, homedir, totalmem } from "node:os";
import { execSync } from "node:child_process";
import { resolve as resolvePath } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import {
	APP_ROOT,
	RESEARCHX_AGENT_LOGO,
	RESEARCHX_VERSION,
} from "./shared.js";
import { getModelContextOverride } from "./custom-providers.js";
import { formatTokens } from "./researchx-model.js";

function visibleLength(text: string): number {
	return visibleWidth(text);
}

function formatHeaderPath(path: string): string {
	const home = homedir();
	return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function truncateVisible(text: string, maxVisible: number): string {
	if (visibleWidth(text) <= maxVisible) return text;
	return truncateToWidth(text, maxVisible, maxVisible <= 3 ? "" : "...");
}

function wrapWords(text: string, maxW: number): string[] {
	const words = text.split(" ");
	const lines: string[] = [];
	let cur = "";
	for (let word of words) {
		if (visibleWidth(word) > maxW) {
			if (cur) { lines.push(cur); cur = ""; }
			word = truncateToWidth(word, maxW, maxW > 3 ? "…" : "");
		}
		const test = cur ? `${cur} ${word}` : word;
		if (cur && visibleWidth(test) > maxW) {
			lines.push(cur);
			cur = word;
		} else {
			cur = test;
		}
	}
	if (cur) lines.push(cur);
	return lines.length ? lines : [""];
}

function padRight(text: string, width: number): string {
	const clipped = truncateVisible(text, width);
	const gap = Math.max(0, width - visibleLength(clipped));
	return `${clipped}${" ".repeat(gap)}`;
}

function centerText(text: string, width: number): string {
	const textWidth = visibleWidth(text);
	if (textWidth >= width) return truncateToWidth(text, width, "");
	const left = Math.floor((width - textWidth) / 2);
	const right = width - textWidth - left;
	return `${" ".repeat(left)}${text}${" ".repeat(right)}`;
}

function getCurrentModelLabel(ctx: ExtensionContext): string {
	if (ctx.model) return `${ctx.model.provider}/${ctx.model.id}`;
	const branch = ctx.sessionManager.getBranch();
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		const entry = branch[index]!;
		if (entry.type === "model_change") return `${(entry as any).provider}/${(entry as any).modelId}`;
	}
	return "not set";
}

function extractMessageText(message: unknown): string {
	if (!message || typeof message !== "object") return "";
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) => {
			if (!item || typeof item !== "object") return "";
			const record = item as { type?: string; text?: unknown; name?: unknown };
			if (record.type === "text" && typeof record.text === "string") return record.text;
			if (record.type === "toolCall") return `[${typeof record.name === "string" ? record.name : "tool"}]`;
			return "";
		})
		.filter(Boolean)
		.join(" ");
}

function getRecentActivitySummary(ctx: ExtensionContext): string {
	const branch = ctx.sessionManager.getBranch();
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		const entry = branch[index]!;
		if (entry.type !== "message") continue;
		const msg = entry as any;
		const text = extractMessageText(msg.message).replace(/\s+/g, " ").trim();
		if (!text) continue;
		const role = msg.message.role === "assistant" ? "agent" : msg.message.role === "user" ? "you" : msg.message.role;
		return `${role}: ${text}`;
	}
	return "";
}

async function buildAgentCatalogSummary(): Promise<{ agents: string[]; chains: string[] }> {
	const agents: string[] = [];
	const chains: string[] = [];
	try {
		const entries = await readdir(resolvePath(APP_ROOT, ".researchx", "agents"), { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
			if (entry.name.endsWith(".chain.md")) {
				chains.push(entry.name.replace(/\.chain\.md$/i, ""));
			} else {
				agents.push(entry.name.replace(/\.md$/i, ""));
			}
		}
	} catch {
		return { agents: [], chains: [] };
	}
	agents.sort();
	chains.sort();
	return { agents, chains };
}

type SystemResources = {
	cpu: string;
	cores: number;
	ramTotal: string;
	ramFree: string;
	gpu: string | null;
	docker: boolean;
};

let cachedResources: SystemResources | null = null;

function detectSystemResources(): SystemResources {
	if (cachedResources) return cachedResources;

	const cores = cpus().length;
	const totalBytes = totalmem();
	const ramTotal = `${Math.round(totalBytes / (1024 ** 3))}GB`;

	cachedResources = { cpu: "", cores, ramTotal, ramFree: "", gpu: null, docker: false };

	try {
		if (process.platform === "darwin") {
			const out = execSync("sysctl -n machdep.cpu.brand_string 2>/dev/null", { encoding: "utf8", timeout: 1000 }).trim();
			if (out) cachedResources.cpu = out;
		}
	} catch {}

	try {
		const probe = process.platform === "win32" ? "where docker" : "command -v docker";
		execSync(probe, { timeout: 500, stdio: "ignore" });
		cachedResources.docker = true;
	} catch {}

	return cachedResources;
}

export type ResearchXHeaderCache = {
	agentSummaryPromise?: Promise<{ agents: string[]; chains: string[] }>;
	commandShortcutsRegistered?: boolean;
	commandContext?: ExtensionContext;
	commandPi?: ExtensionAPI;
	headerRequestRender?: () => void;
};

const QUOTES_OF_THE_DAY = [
	"The important thing is to never stop questioning.",
	"Somewhere, something incredible is waiting to be known.",
	"Adopt the pace of nature: her secret is patience.",
	"What we know is a drop; what we do not know is an ocean.",
	"The cure for boredom is curiosity. There is no cure for curiosity.",
	"Research is seeing what everybody else has seen and thinking what nobody else has thought.",
];

function getDayOfYear(date: Date): number {
	const start = new Date(date.getFullYear(), 0, 0);
	return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}

export function getQuoteOfTheDay(date: Date): string {
	return QUOTES_OF_THE_DAY[getDayOfYear(date) % QUOTES_OF_THE_DAY.length]!;
}

export function formatHeaderDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/** Spinning status dot: advances on every header render (startup, streaming). */
const SPIN_FRAMES = ["◐", "◓", "◑", "◒"];

function spinFrame(): string {
	return SPIN_FRAMES[Math.floor(Date.now() / 250) % SPIN_FRAMES.length]!;
}

/** Launch boot phase by elapsed time: plays INITIALIZING → CALIBRATING → ONLINE. */
function bootPhase(bootAt: number): { label: string; ready: boolean } {
	const elapsed = Date.now() - bootAt;
	if (elapsed < 1500) return { label: "INITIALIZING NEURAL CORE…", ready: false };
	if (elapsed < 3000) return { label: "CALIBRATING RESEARCH GRID…", ready: false };
	return { label: "CORE ONLINE", ready: true };
}

/** Greeting companion: a small cat that blinks every couple of seconds
 * (the header re-renders on a 250ms timer, so the blink plays live). */
const CAT_OPEN = [
	"    /\\      /\\      ",
	"    |  \\____/  |    ",
	"    |  o    o  |    ",
	"    |    __    |    ",
	"    |   /  \\   |    ",
	"     \\_/    \\_/     ",
];
const CAT_BLINK = [
	"    /\\      /\\      ",
	"    |  \\____/  |    ",
	"    |  -    -  |    ",
	"    |    __    |    ",
	"    |   /  \\   |    ",
	"     \\_/    \\_/     ",
];

function catFrame(): string[] {
	return Math.floor(Date.now() / 2200) % 2 === 1 ? CAT_BLINK : CAT_OPEN;
}

function commandChoices(pi: ExtensionAPI): string[] {
	return pi.getCommands()
		.filter((command) => typeof command.name === "string" && command.name.length > 0)
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((command) => `/${command.name}${command.description ? ` — ${command.description}` : ""}`);
}

function commandFromChoice(choice: string): string {
	return choice.split(" — ", 1)[0]!;
}

function modelCommand(pi: ExtensionAPI): string {
	const names = new Set(pi.getCommands().map((command) => command.name));
	if (names.has("researchx-model")) return "/researchx-model";
	if (names.has("model")) return "/model";
	return "/researchx-model";
}

export function installResearchXHeader(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	cache: ResearchXHeaderCache,
): void | Promise<void> {
	if (!ctx.hasUI) return;

	cache.agentSummaryPromise ??= buildAgentCatalogSummary();
	cache.commandContext = ctx;
	cache.commandPi = pi;

	return cache.agentSummaryPromise.then((agentData) => {
		if (!cache.commandShortcutsRegistered) {
			pi.registerShortcut("ctrl+shift+c", {
				description: "Open the ResearchX command deck",
				handler: async () => {
					const activeContext = cache.commandContext;
					const activePi = cache.commandPi;
					if (!activeContext?.hasUI || !activePi) return;
					const selected = await activeContext.ui.select("ALL COMMANDS", commandChoices(activePi));
					if (selected) activeContext.ui.setEditorText(commandFromChoice(selected));
				},
			});
			pi.registerShortcut("ctrl+shift+h", {
				description: "Prefill ResearchX help",
				handler: () => { cache.commandContext?.ui.setEditorText("/help"); },
			});
			pi.registerShortcut("ctrl+shift+m", {
				description: "Prefill the ResearchX model command",
				handler: () => {
					const activeContext = cache.commandContext;
					const activePi = cache.commandPi;
					if (activeContext && activePi) activeContext.ui.setEditorText(modelCommand(activePi));
				},
			});
			cache.commandShortcutsRegistered = true;
		}

		const bootAt = Date.now();
		const resources = detectSystemResources();
		const toolCount = pi.getAllTools().length;
		const commandCount = pi.getCommands().length;
		const agentCount = agentData.agents.length + agentData.chains.length;
		const activitySnapshot = getRecentActivitySummary(ctx);

		ctx.ui.setHeader((tui, theme) => {
			let pulseIndex = 0;
			let disposed = false;
			const requestRender = () => {
				if (!disposed) tui.requestRender();
			};
			cache.headerRequestRender = requestRender;
			const animationTimer = setInterval(() => {
				pulseIndex = (pulseIndex + 1) % 4;
				requestRender();
			}, 250);
			// Header animation must never keep test or print-mode processes alive.
			animationTimer.unref?.();

			const component = {
				render(width: number): string[] {
				if (width < 16) return [truncateVisible(`${spinFrame()} RX`, Math.max(1, width))];

				const maxW = Math.max(width - 2, 1);
				const cardW = Math.min(maxW, 120);
				const innerW = cardW - 2;
				const contentW = innerW - 2;
				const outerPad = " ".repeat(Math.max(0, Math.floor((width - cardW) / 2)));
				const lines: string[] = [];

				const push = (line: string) => { lines.push(`${outerPad}${line}`); };
				const border = (ch: string) => theme.fg("borderMuted", ch);

				const row = (content: string): string =>
					`${border("│")} ${padRight(content, contentW)} ${border("│")}`;
				const emptyRow = (): string =>
					`${border("│")}${" ".repeat(innerW)}${border("│")}`;
				const sep = (): string =>
					`${border("├")}${border("─".repeat(innerW))}${border("┤")}`;

				const useWideLayout = contentW >= 70;
				const leftW = useWideLayout ? Math.min(38, Math.floor(contentW * 0.35)) : 0;
				const divColW = useWideLayout ? 3 : 0;
				const rightW = useWideLayout ? contentW - leftW - divColW : contentW;

				const twoCol = (left: string, right: string): string => {
					if (!useWideLayout) return row(left || right);
					return row(
						`${padRight(left, leftW)}${border(" │ ")}${padRight(right, rightW)}`,
					);
				};

				const commandPanelLines = (panelW: number): string[] => {
					const panelLines: string[] = ["", theme.fg("accent", theme.bold("Command Deck"))];
					for (const line of [
						"[Ctrl+Shift+C] ALL COMMANDS",
						"[Ctrl+Shift+H] HELP",
						"[Ctrl+Shift+M] MODELS",
					]) {
						for (const wrapped of wrapWords(line, Math.max(1, panelW))) {
							panelLines.push(theme.fg("inputText" as Parameters<typeof theme.fg>[0], wrapped));
						}
					}
				panelLines.push(theme.fg("dim", "Ctrl+Shift + key to open"));
				panelLines.push("");
				panelLines.push(theme.fg("accent", theme.bold("COMPANION")));
				panelLines.push(centerText(theme.fg("accent", theme.bold("Hello!")), panelW));
				for (const catLine of catFrame()) {
					panelLines.push(centerText(catLine, panelW));
				}
				return panelLines;
				};

				const modelLabel = getCurrentModelLabel(ctx);
				const sessionId = ctx.sessionManager.getSessionName()?.trim() || ctx.sessionManager.getSessionId();
				const dirLabel = formatHeaderPath(ctx.cwd);
				// Keep the header stable during streaming work. Recomputing this from the live
				// branch on every render makes high-churn workflows redraw the whole viewport.
				const activity = activitySnapshot;
				const frame = spinFrame();
				const boot = bootPhase(bootAt);
				const modelCtx = (() => {
					if (!ctx.model) return "";
					const override = getModelContextOverride(ctx.model.provider, ctx.model.id);
					const raw = override ?? (ctx.model as { contextWindow?: unknown }).contextWindow;
					return typeof raw === "number" && Number.isFinite(raw) ? ` · ${formatTokens(raw)} ctx` : "";
				})();

				push("");
				if (cardW >= 70) {
					for (const logoLine of RESEARCHX_AGENT_LOGO) {
						const tileLine = centerText(truncateVisible(logoLine, cardW), cardW);
						push(theme.fg("borderAccent", theme.bold(tileLine)));
					}
					push("");
				}

				// Boot status line: the launch animation (phases advance per render).
				if (cardW >= 40) {
					const bootText = boot.ready
						? `${frame} CORE ONLINE · ${toolCount} tools armed`
						: `${frame} ${boot.label}`;
					const bootOffset = " ".repeat(Math.max(0, Math.floor((cardW - bootText.length) / 2)));
					push(theme.fg(boot.ready ? "success" : "dim", `${bootOffset}${truncateVisible(bootText, cardW)}`));
					push("");
				}

				const versionTag = ` v${RESEARCHX_VERSION} `;
				const gap = Math.max(0, innerW - versionTag.length);
				const gapL = Math.floor(gap / 2);
				push(
					border(`╭${"─".repeat(gapL)}`) +
					theme.fg("dim", versionTag) +
					border(`${"─".repeat(gap - gapL)}╮`),
				);

				if (useWideLayout) {
					const leftValueW = Math.max(1, leftW - 11);
					const indent = " ".repeat(11);
					const leftLines: string[] = [""];

					const pushLabeled = (label: string, value: string, color: "text" | "dim") => {
						const wrapped = wrapWords(value, leftValueW);
						leftLines.push(`${theme.fg("dim", label.padEnd(10))} ${theme.fg(color, wrapped[0]!)}`);
						for (let i = 1; i < wrapped.length; i++) {
							leftLines.push(`${indent}${theme.fg(color, wrapped[i]!)}`);
						}
					};

					pushLabeled("model", `${modelLabel}${modelCtx}`, "text");
					pushLabeled("directory", dirLabel, "text");
					pushLabeled("session", sessionId, "dim");
					leftLines.push("");
					const sysParts = [`${resources.cores} cores`, resources.ramTotal];
					if (resources.docker) sysParts.push("docker");
					pushLabeled("system", sysParts.join(" · "), "dim");
					leftLines.push("");
					leftLines.push(theme.fg("dim", `${toolCount} tools · ${agentCount} agents`));
					const today = new Date();
					leftLines.push(theme.fg("accent", theme.bold(`${formatHeaderDate(today)} // DAILY SIGNAL`)));
					for (const line of wrapWords(`"${getQuoteOfTheDay(today)}"`, leftW)) {
						leftLines.push(theme.fg("dim", line));
					}

					if (activity) {
						const maxActivityLen = leftW * 2;
						const trimmed = visibleWidth(activity) > maxActivityLen
							? truncateToWidth(activity, maxActivityLen, "…")
							: activity;
						leftLines.push("");
						leftLines.push(theme.fg("accent", theme.bold("Last Activity")));
						for (const line of wrapWords(trimmed, leftW)) {
							leftLines.push(theme.fg("dim", line));
						}
					}

					const rightLines = commandPanelLines(rightW);

					const maxRows = Math.max(leftLines.length, rightLines.length);
					for (let i = 0; i < maxRows; i++) {
						push(twoCol(leftLines[i] ?? "", rightLines[i] ?? ""));
					}
				} else {
					const narrowValW = Math.max(1, contentW - 11);
					push(emptyRow());
					push(row(`${theme.fg("dim", "model".padEnd(10))} ${theme.fg("text", truncateVisible(`${modelLabel}${modelCtx}`, narrowValW))}`));
					push(row(`${theme.fg("dim", "directory".padEnd(10))} ${theme.fg("text", truncateVisible(dirLabel, narrowValW))}`));
					push(row(`${theme.fg("dim", "session".padEnd(10))} ${theme.fg("dim", truncateVisible(sessionId, narrowValW))}`));
					const resourceLine = `${resources.cores} cores · ${resources.ramTotal}${resources.docker ? " · docker" : ""}`;
					push(row(theme.fg("dim", truncateVisible(resourceLine, contentW))));
					push(row(theme.fg("dim", truncateVisible(`${toolCount} tools · ${agentCount} agents · ${commandCount} commands`, contentW))));
					const today = new Date();
					push(row(theme.fg("accent", truncateVisible(`${formatHeaderDate(today)} // "${getQuoteOfTheDay(today)}"`, contentW))));
					push(emptyRow());

					push(sep());
					for (const line of commandPanelLines(contentW)) push(row(line));
				}

				push(sep());
				push(row(theme.fg("dim", truncateVisible("Type / for commands · Ctrl+Shift+C opens the deck · /help for workflows", contentW))));
				push(border(`╰${"─".repeat(innerW)}╯`));
				push("");
				return lines;
			},
				invalidate() {},
				dispose() {
					disposed = true;
					clearInterval(animationTimer);
					if (cache.headerRequestRender === requestRender) cache.headerRequestRender = undefined;
				},
			};
			return component;
	});
	});
}
