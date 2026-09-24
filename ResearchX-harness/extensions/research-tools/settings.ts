import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
	formatContextTokens,
	parseContextValue,
	setProviderModelContextWindow,
} from "../../src/model/context-window.js";
import {
	getModelContextOverride,
	readCustomProvidersFile,
	registerProviderEntry,
} from "./custom-providers.js";

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

type ModelRef = { provider: string; id: string; contextWindow?: unknown };

function effectiveWindow(model: ModelRef): number | undefined {
	const override = getModelContextOverride(model.provider, model.id);
	if (override !== undefined) return override;
	return typeof model.contextWindow === "number" && Number.isFinite(model.contextWindow)
		? model.contextWindow
		: undefined;
}

function formatModelSpec(model: { provider: string; id: string }): string {
	return `${model.provider}/${model.id}`;
}

async function selectLabel(
	ctx: CommandContext,
	title: string,
	labels: string[],
): Promise<string | undefined> {
	return ctx.ui.select(title, labels);
}

const CONTEXT_PRESETS: Array<{ label: string; value: number }> = [
	{ label: "128K", value: 128_000 },
	{ label: "512K", value: 512_000 },
	{ label: "1M (ResearchX default)", value: 1_000_000 },
	{ label: "2M", value: 2_000_000 },
	{ label: "Custom…", value: -1 },
];

async function changeContextWindow(ctx: CommandContext, model: ModelRef): Promise<void> {
	const spec = formatModelSpec(model);
	const picked = await selectLabel(
		ctx,
		`Context window for ${spec} (now ${formatContextTokens(effectiveWindow(model))})`,
		CONTEXT_PRESETS.map((preset) => preset.label),
	);
	const preset = CONTEXT_PRESETS.find((entry) => entry.label === picked);
	if (!preset) return;
	let value = preset.value;
	if (value === -1) {
		const raw = await ctx.ui.input("Custom context window (e.g. 128K, 1M, 2000000)", "1000000");
		if (raw === undefined) return;
		const parsed = parseContextValue(raw);
		if (parsed === undefined) {
			ctx.ui.notify("Invalid context window. Use 1K–100M, e.g. 512K or 1000000.", "error");
			return;
		}
		value = parsed;
	}
	const result = setProviderModelContextWindow(model.provider, model.id, value);
	if (!result.overrideWritten) {
		ctx.ui.notify("Could not persist the context-window override.", "error");
		return;
	}
	// Apply to the live registry when the model is file-defined; everything
	// else takes effect for new sessions.
	if (result.fileUpdated) {
		const { file } = readCustomProvidersFile();
		const entry = (file.providers ?? []).find((candidate) => candidate.id === model.provider);
		if (entry) {
			registerProviderEntry(ctx.modelRegistry, entry);
		}
	}
	try {
		await ctx.modelRegistry.refresh();
	} catch {
		// Best effort; new sessions always pick the value up from disk.
	}
	ctx.ui.notify(
		`Context window for ${spec} set to ${formatContextTokens(value)}. ` +
			`New sessions use it; reopen /setting to confirm. Oversized values fail at the provider if the backend supports less.`,
		"info",
	);
}

export function registerSettingsCommand(pi: ExtensionAPI): void {
	pi.registerCommand("setting", {
		description: "ResearchX settings: context window selection and model defaults.",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("The settings menu needs interactive mode. Use `researchx model context` from a terminal instead.", "error");
				return;
			}
			try {
				ctx.modelRegistry.refresh();
				const available = [...ctx.modelRegistry.getAvailable()].sort((left, right) =>
					formatModelSpec(left).localeCompare(formatModelSpec(right)),
				);
				if (available.length === 0) {
					ctx.ui.notify("No models available.", "error");
					return;
				}
				const current = ctx.model ? formatModelSpec(ctx.model) : undefined;
				const ordered = [
					...(current ? available.filter((model) => formatModelSpec(model) === current) : []),
					...available.filter((model) => formatModelSpec(model) !== current),
				];
				const items = ordered.map((model) => {
					const spec = formatModelSpec(model);
					const window = formatContextTokens(effectiveWindow(model as ModelRef));
					const suffix = spec === current ? " (current)" : "";
					return { label: `${spec} [${window}]${suffix}`, model: model as ModelRef };
				});
				const picked = await selectLabel(
					ctx,
					"ResearchX Settings — pick a model to set its context window",
					items.map((item) => item.label),
				);
				if (!picked) return;
				const model = items.find((item) => item.label === picked)?.model;
				if (!model) return;
				await changeContextWindow(ctx, model);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}
