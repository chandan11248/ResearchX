import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
	formatContextTokens,
	getModelContextOverride,
	parseContextValue,
	readCustomProvidersFile,
	setModelContextOverride,
} from "../../src/model/context-window.js";

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

function formatModelSpec(model: { provider: string; id: string }): string {
	return `${model.provider}/${model.id}`;
}

function describeWindow(
	ctx: CommandContext,
	provider: string,
	id: string,
): { effective: number | undefined; source: string } {
	const override = getModelContextOverride(provider, id);
	if (override !== undefined) return { effective: override, source: "models.json override" };
	const live = [...ctx.modelRegistry.getAvailable()].find(
		(model) => model.provider === provider && model.id === id,
	) as { contextWindow?: unknown } | undefined;
	if (typeof live?.contextWindow === "number" && Number.isFinite(live.contextWindow)) {
		return { effective: live.contextWindow, source: "provider default" };
	}
	const { file } = readCustomProvidersFile();
	const fileValue = (file.providers ?? [])
		.find((entry) => entry.id === provider)?.models
		?.find((model) => model.id === id)?.contextWindow;
	if (fileValue !== undefined) return { effective: fileValue, source: "custom-providers.json" };
	return { effective: undefined, source: "provider default" };
}

export function registerContextWindowCommand(pi: ExtensionAPI): void {
	pi.registerCommand("context-window", {
		description: "View or set the current model's context window (e.g. /context-window 1M).",
		handler: async (args, ctx) => {
			if (!ctx.model) {
				ctx.ui.notify("No active model. Pick one in /researchx-model first.", "error");
				return;
			}
			const { provider, id } = ctx.model;
			const spec = formatModelSpec(ctx.model);
			const raw = args.trim();
			if (!raw) {
				const { effective, source } = describeWindow(ctx, provider, id);
				ctx.ui.notify(
					`${spec}: context window ${formatContextTokens(effective)} (${source}). ` +
						`Set with /context-window <value> (e.g. 512K, 1M). Applies to new sessions.`,
					"info",
				);
				return;
			}
			const value = parseContextValue(raw);
			if (value === undefined) {
				ctx.ui.notify("Invalid context window. Use 1K–100M, e.g. /context-window 512K.", "error");
				return;
			}
			if (!setModelContextOverride(provider, id, value)) {
				ctx.ui.notify("Could not persist the context-window override.", "error");
				return;
			}
			try {
				await ctx.modelRegistry.refresh();
			} catch {
				// Best effort; new sessions always pick the override up from disk.
			}
			ctx.ui.notify(
				`Context window for ${spec} set to ${formatContextTokens(value)} (models.json override). ` +
					`Applies to new sessions. Oversized values fail at the provider if the backend supports less.`,
				"info",
			);
		},
	});
}
