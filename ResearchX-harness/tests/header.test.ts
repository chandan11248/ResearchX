import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import {
	formatHeaderDate,
	getQuoteOfTheDay,
	installResearchXHeader,
} from "../extensions/research-tools/header.js";

type HeaderFactory = (_tui: { requestRender: () => void }, theme: {
	fg: (_color: string, text: string) => string;
	bold: (text: string) => string;
}) => {
	render: (width: number) => string[];
	invalidate: () => void;
	dispose?: () => void;
};

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

function makeContext(setHeader: (factory: HeaderFactory) => void) {
	return {
		hasUI: true,
		model: { provider: "openai", id: "gpt-5.5" },
		cwd: process.cwd(),
		sessionManager: {
			getBranch: () => [],
			getSessionName: () => "test",
			getSessionId: () => "session-1",
		},
		ui: { setHeader },
	};
}

test("ResearchX header renders the command deck, date signal, and greeting cat", async () => {
	let headerFactory: HeaderFactory | undefined;
	const shortcuts: Record<string, { handler: () => void | Promise<void> }> = {};
	const editorValues: string[] = [];
	const pi = {
		getCommands: () => [
			{ source: "prompt", name: "deepresearch", description: "Run a deep research workflow." },
			{ source: "prompt", name: "review", description: "Review a research draft." },
		],
		getAllTools: () => new Array(3),
		registerShortcut: (shortcut: string, options: { handler: () => void | Promise<void> }) => {
			shortcuts[shortcut] = options;
		},
	};

	const ctx = makeContext((factory) => { headerFactory = factory; }) as any;
	ctx.ui.select = async () => "/deepresearch — Run a deep research workflow.";
	ctx.ui.setEditorText = (value: string) => editorValues.push(value);
	await installResearchXHeader(pi as any, ctx, {});
	assert.ok(headerFactory);
	assert.deepEqual(Object.keys(shortcuts).sort(), ["ctrl+shift+c", "ctrl+shift+h", "ctrl+shift+m"]);

	const component = headerFactory({ requestRender: () => {} }, theme);
	const text = component.render(120).join("\n");
	assert.doesNotMatch(text, /Skill Matrix/);
	assert.match(text, /Command Deck/);
	assert.match(text, /ALL COMMANDS/);
	assert.match(text, /HELP/);
	assert.match(text, /MODELS/);
	assert.match(text, /COMPANION/);
	assert.doesNotMatch(text, /NEBULA/);
	assert.doesNotMatch(text, /MÖBIUS/);
	assert.match(text, /Hello, hooman!/);
	assert.match(text, /\/\\_\/\\/);
	assert.match(text, /DAILY SIGNAL/);
	assert.match(text, new RegExp(formatHeaderDate(new Date())));
	const quote = getQuoteOfTheDay(new Date());
	assert.match(text, new RegExp(quote.split(" ").slice(0, 5).join(" ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	assert.match(text, /INITIALIZING|CALIBRATING|CORE ONLINE/);

	await shortcuts["ctrl+shift+c"]!.handler();
	shortcuts["ctrl+shift+h"]!.handler();
	shortcuts["ctrl+shift+m"]!.handler();
	assert.deepEqual(editorValues, ["/deepresearch", "/help", "/researchx-model"]);
	component.dispose?.();
});

test("ResearchX header keeps every rendered line within narrow terminal widths", async () => {
	let headerFactory: HeaderFactory | undefined;
	const pi = {
		getCommands: () => [{ source: "prompt", name: "gather-context-and-clarify", description: "Use subagents to gather context before execution." }],
		getAllTools: () => [],
		registerShortcut: () => {},
	};

	await installResearchXHeader(pi as any, makeContext((factory) => { headerFactory = factory; }) as any, {});
	assert.ok(headerFactory);
	const component = headerFactory({ requestRender: () => {} }, theme);
	for (const width of [160, 100, 50, 32, 16, 8, 7]) {
		const lines = component.render(width);
		assert.ok(lines.length > 0);
		for (const line of lines) {
			assert.ok(
				visibleWidth(line) <= width,
				`expected line width ${visibleWidth(line)} to fit terminal width ${width}: ${line}`,
			);
		}
	}
	component.dispose?.();
});
