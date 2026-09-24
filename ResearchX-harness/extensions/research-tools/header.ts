import { homedir } from "node:os";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

import { RESEARCHX_VERSION } from "./shared.js";
import { getModelContextOverride } from "./custom-providers.js";
import { formatTokens } from "./researchx-model.js";

function formatHeaderPath(path: string): string {
	const home = homedir();
	return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function getCurrentModelLabel(ctx: ExtensionContext): string {
	if (ctx.model) return `${ctx.model.provider}/${ctx.model.id}`;
	const branch = ctx.sessionManager.getBranch();
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		const entry = branch[index]!;
		if (entry.type !== "model_change") continue;
		const record = entry as unknown as { provider?: unknown; modelId?: unknown };
		if (typeof record.provider === "string" && typeof record.modelId === "string") {
			return `${record.provider}/${record.modelId}`;
		}
	}
	return "not set";
}

function getCurrentContextLabel(ctx: ExtensionContext): string {
	if (!ctx.model) return "";
	const override = getModelContextOverride(ctx.model.provider, ctx.model.id);
	const raw = override ?? (ctx.model as { contextWindow?: unknown }).contextWindow;
	const value = typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
	return value !== undefined ? ` · ${formatTokens(value)} ctx` : "";
}

/**
 * Minimal one-banner header: identity + model + hints. Command discovery
 * lives in `/help`, the `/` autocomplete preview, and `/commands` — not here.
 */
export function installResearchXHeader(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	cache: { agentSummaryPromise?: Promise<{ agents: string[]; chains: string[] }> },
): void | Promise<void> {
	if (!ctx.hasUI) return;
	void pi;
	void cache;

	const modelLabel = getCurrentModelLabel(ctx);
	const contextLabel = getCurrentContextLabel(ctx);
	const dirLabel = formatHeaderPath(ctx.cwd);

	ctx.ui.setHeader((_tui, theme) => ({
		render(width: number): string[] {
			const maxW = Math.max(10, width);
			const title = truncateToWidth(
				`ResearchX v${RESEARCHX_VERSION} · ${modelLabel}${contextLabel} · ${dirLabel}`,
				maxW,
				"…",
			);
			const hint = truncateToWidth(
			 `/ commands · /help workflows · /researchx-model models+context · PgUp/PgDn scroll`,
				maxW,
				"…",
			);
			return [theme.fg("accent", theme.bold(title)), theme.fg("dim", hint)];
		},
		invalidate() {},
	}));
}
