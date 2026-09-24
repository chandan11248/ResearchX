import assert from "node:assert/strict";
import test from "node:test";

import {
	patchPiInteractiveThemeSource,
	patchPiThemeSchemaSource,
} from "../scripts/lib/pi-tui-patch.mjs";

const THEME_JS = `export function getEditorTheme() {
    return {
        borderColor: (text) => " ".repeat(text.length),
        bgColor: (text) => theme.bg("userMessageBg", text),
        input: (text) => theme.fg("text", text),
        placeholderText: "Type your message",
        selectList: getSelectListTheme(),
    };
}
export function getSettingsListTheme() {}`;

const FALLBACKS = `function withThemeColorFallbacks(colors) {
    return {
        ...colors,
        searchMatchText: colors.searchMatchText ?? colors.text,
    };
}`;

const CTOR = `        const colors = {
            ...fgColors,
            searchMatchText: fgColors.searchMatchText ?? fgColors.text,
        };`;

const SCHEMA_ANCHOR = `{
				"thinkingText": {
					"$ref": "#/$defs/colorValue",
					"description": "Thinking block text color"
				},
				"selectedBg": {}}`;

test("theme patch routes editor input through the inputText color with fallbacks", () => {
	const patched = patchPiInteractiveThemeSource(`${THEME_JS}\n${FALLBACKS}\n${CTOR}`);
	assert.match(patched, /theme\.fg\("inputText"/);
	assert.match(patched, /inputText: colors\.inputText \?\? colors\.text,/);
	assert.match(patched, /inputText: fgColors\.inputText \?\? fgColors\.text,/);
	assert.match(patched, /borderColor: \(text\) => theme\.fg\("borderAccent", text\),/);
});

test("theme patch is idempotent", () => {
	const once = patchPiInteractiveThemeSource(`${THEME_JS}\n${FALLBACKS}\n${CTOR}`);
	assert.equal(patchPiInteractiveThemeSource(once), once);
});

test("theme patch throws when anchors are missing", () => {
	assert.throws(() => patchPiInteractiveThemeSource("export const x = 1;"), /editor-theme patch anchor/);
});

test("theme-schema patch accepts an optional inputText key", () => {
	const patched = patchPiThemeSchemaSource(SCHEMA_ANCHOR);
	assert.match(patched, /"inputText"/);
	JSON.parse(patched);
	assert.equal(patchPiThemeSchemaSource(patched), patched);
});

test("theme-schema patch throws when anchor is missing", () => {
	assert.throws(() => patchPiThemeSchemaSource("{}"), /theme-schema layout/);
});
