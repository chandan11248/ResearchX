const OVERFLOW_THROW_BLOCK = `            const line = newLines[i];
            const isImage = isImageLine(line);
            if (!isImage && visibleWidth(line) > width) {
                // Log all lines to crash file for debugging
                const crashLogPath = path.join(os.homedir(), ".pi", "agent", "pi-crash.log");
                const crashData = [
                    \`Crash at \${new Date().toISOString()}\`,
                    \`Terminal width: \${width}\`,
                    \`Line \${i} visible width: \${visibleWidth(line)}\`,
                    "",
                    "=== All rendered lines ===",
                    ...newLines.map((l, idx) => \`[\${idx}] (w=\${visibleWidth(l)}) \${l}\`),
                    "",
                ].join("\\n");
                fs.mkdirSync(path.dirname(crashLogPath), { recursive: true });
                fs.writeFileSync(crashLogPath, crashData);
                // Clean up terminal state before throwing
                this.stop();
                const errorMsg = [
                    \`Rendered line \${i} exceeds terminal width (\${visibleWidth(line)} > \${width}).\`,
                    "",
                    "This is likely caused by a custom TUI component not truncating its output.",
                    "Use visibleWidth() to measure and truncateToWidth() to truncate lines.",
                    "",
                    \`Debug log written to: \${crashLogPath}\`,
                ].join("\\n");
                throw new Error(errorMsg);
            }
            buffer += line;`;

const OVERFLOW_TRUNCATE_BLOCK = `            let line = newLines[i];
            const isImage = isImageLine(line);
            if (!isImage && visibleWidth(line) > width) {
                line = sliceByColumn(line, 0, width, true);
            }
            buffer += line;`;

const OVERFLOW_THROW_BLOCK_AFTER_CLEAR = `            const line = newLines[i];
            const isImage = isImageLine(line);
            const imageReservedRows = isImage ? this.getKittyImageReservedRows(newLines, i, renderEnd) : 1;
            if (imageReservedRows > 1) {
                const imageStartScreenRow = i - viewportTop;
                if (imageStartScreenRow < 0 || imageStartScreenRow + imageReservedRows > height) {
                    logRedraw(\`kitty image pre-clear would scroll (\${imageStartScreenRow} + \${imageReservedRows} > \${height})\`);
                    fullRender(true);
                    return;
                }
                buffer += "\\x1b[2K";
                for (let row = 1; row < imageReservedRows; row++) {
                    buffer += "\\r\\n\\x1b[2K";
                }
                buffer += \`\\x1b[\${imageReservedRows - 1}A\`;
                buffer += line;
                buffer += \`\\x1b[\${imageReservedRows - 1}B\`;
                i += imageReservedRows - 1;
                continue;
            }
            buffer += "\\x1b[2K"; // Clear current line
            if (!isImage && visibleWidth(line) > width) {
                // Log all lines to crash file for debugging
                const crashLogPath = path.join(os.homedir(), ".pi", "agent", "pi-crash.log");
                const crashData = [
                    \`Crash at \${new Date().toISOString()}\`,
                    \`Terminal width: \${width}\`,
                    \`Line \${i} visible width: \${visibleWidth(line)}\`,
                    "",
                    "=== All rendered lines ===",
                    ...newLines.map((l, idx) => \`[\${idx}] (w=\${visibleWidth(l)}) \${l}\`),
                    "",
                ].join("\\n");
                fs.mkdirSync(path.dirname(crashLogPath), { recursive: true });
                fs.writeFileSync(crashLogPath, crashData);
                // Clean up terminal state before throwing
                this.stop();
                const errorMsg = [
                    \`Rendered line \${i} exceeds terminal width (\${visibleWidth(line)} > \${width}).\`,
                    "",
                    "This is likely caused by a custom TUI component not truncating its output.",
                    "Use visibleWidth() to measure and truncateToWidth() to truncate lines.",
                    "",
                    \`Debug log written to: \${crashLogPath}\`,
                ].join("\\n");
                throw new Error(errorMsg);
            }
            buffer += line;`;

const OVERFLOW_TRUNCATE_BLOCK_AFTER_CLEAR = `            let line = newLines[i];
            const isImage = isImageLine(line);
            const imageReservedRows = isImage ? this.getKittyImageReservedRows(newLines, i, renderEnd) : 1;
            if (imageReservedRows > 1) {
                const imageStartScreenRow = i - viewportTop;
                if (imageStartScreenRow < 0 || imageStartScreenRow + imageReservedRows > height) {
                    logRedraw(\`kitty image pre-clear would scroll (\${imageStartScreenRow} + \${imageReservedRows} > \${height})\`);
                    fullRender(true);
                    return;
                }
                buffer += "\\x1b[2K";
                for (let row = 1; row < imageReservedRows; row++) {
                    buffer += "\\r\\n\\x1b[2K";
                }
                buffer += \`\\x1b[\${imageReservedRows - 1}A\`;
                buffer += line;
                buffer += \`\\x1b[\${imageReservedRows - 1}B\`;
                i += imageReservedRows - 1;
                continue;
            }
            buffer += "\\x1b[2K"; // Clear current line
            if (!isImage && visibleWidth(line) > width) {
                line = sliceByColumn(line, 0, width, true);
            }
            buffer += line;`;

const OVERFLOW_THROW_BLOCK_AFTER_CLEAR_CURRENT = OVERFLOW_THROW_BLOCK_AFTER_CLEAR.replace(
	'path.join(os.homedir(), ".pi", "agent", "pi-crash.log")',
	'path.join(this.logDirectory, "pi-crash.log")',
);

const CURRENT_EDITOR_IMPORT = 'import { cjkBreakRegex, getGraphemeSegmenter, getWordSegmenter, isWhitespaceChar, sliceByColumn, visibleWidth, } from "../utils.js";';
const CURRENT_EDITOR_IMPORT_PATCHED = 'import { applyBackgroundToLine, cjkBreakRegex, getGraphemeSegmenter, getWordSegmenter, isWhitespaceChar, sliceByColumn, visibleWidth, } from "../utils.js";';

// Two known upstream layouts: pi-tui <=0.75 and the 0.76+ Unicode
// word-navigation rework. Both need applyBackgroundToLine added for the
// background-fill render below.
const EDITOR_IMPORT_PAIRS = [
	[
		'import { getSegmenter, isPunctuationChar, isWhitespaceChar, truncateToWidth, visibleWidth } from "../utils.js";',
		'import { applyBackgroundToLine, getSegmenter, isPunctuationChar, isWhitespaceChar, truncateToWidth, visibleWidth } from "../utils.js";',
	],
	[
		'import { getGraphemeSegmenter, getWordSegmenter, isWhitespaceChar, truncateToWidth, visibleWidth } from "../utils.js";',
		'import { applyBackgroundToLine, getGraphemeSegmenter, getWordSegmenter, isWhitespaceChar, truncateToWidth, visibleWidth } from "../utils.js";',
	],
];

const EDITOR_RENDER_BLOCK = [
	"    render(width) {",
	"        const maxPadding = Math.max(0, Math.floor((width - 1) / 2));",
	"        const paddingX = Math.min(this.paddingX, maxPadding);",
	"        const contentWidth = Math.max(1, width - paddingX * 2);",
	"        // Layout width: with padding the cursor can overflow into it,",
	"        // without padding we reserve 1 column for the cursor.",
	"        const layoutWidth = Math.max(1, contentWidth - (paddingX ? 0 : 1));",
	"        // Store for cursor navigation (must match wrapping width)",
	"        this.lastWidth = layoutWidth;",
	'        const horizontal = this.borderColor("─");',
	"        const bgColor = this.theme.bgColor;",
	"        // Layout the text",
	"        const layoutLines = this.layoutText(layoutWidth);",
	"        // Calculate max visible lines: 30% of terminal height, minimum 5 lines",
	"        const terminalRows = this.tui.terminal.rows;",
	"        const maxVisibleLines = Math.max(5, Math.floor(terminalRows * 0.3));",
	"        // Find the cursor line index in layoutLines",
	"        let cursorLineIndex = layoutLines.findIndex((line) => line.hasCursor);",
	"        if (cursorLineIndex === -1)",
	"            cursorLineIndex = 0;",
	"        // Adjust scroll offset to keep cursor visible",
	"        if (cursorLineIndex < this.scrollOffset) {",
	"            this.scrollOffset = cursorLineIndex;",
	"        }",
	"        else if (cursorLineIndex >= this.scrollOffset + maxVisibleLines) {",
	"            this.scrollOffset = cursorLineIndex - maxVisibleLines + 1;",
	"        }",
	"        // Clamp scroll offset to valid range",
	"        const maxScrollOffset = Math.max(0, layoutLines.length - maxVisibleLines);",
	"        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScrollOffset));",
	"        // Get visible lines slice",
	"        const visibleLines = layoutLines.slice(this.scrollOffset, this.scrollOffset + maxVisibleLines);",
	"        const result = [];",
	'        const leftPadding = " ".repeat(paddingX);',
	"        const rightPadding = leftPadding;",
	"        const renderBorderLine = (indicator) => {",
	"            const remaining = width - visibleWidth(indicator);",
	"            if (remaining >= 0) {",
	'                return this.borderColor(indicator + "─".repeat(remaining));',
	"            }",
	"            return this.borderColor(truncateToWidth(indicator, width));",
	"        };",
	"        // Render top padding row. When background fill is active, mimic the user-message block",
	"        // instead of the stock editor chrome.",
	"        if (bgColor) {",
	"            if (this.scrollOffset > 0) {",
	"                const indicator = `  ↑ ${this.scrollOffset} more`;",
	"                result.push(applyBackgroundToLine(indicator, width, bgColor));",
	"            }",
	"            else {",
	'                result.push(applyBackgroundToLine("", width, bgColor));',
	"            }",
	"        }",
	"        else if (this.scrollOffset > 0) {",
	"            const indicator = `─── ↑ ${this.scrollOffset} more `;",
	"            result.push(renderBorderLine(indicator));",
	"        }",
	"        else {",
	"            result.push(horizontal.repeat(width));",
	"        }",
	"        // Render each visible layout line",
	"        // Emit hardware cursor marker when focused so the TUI can position the",
	"        // hardware cursor for IME candidate windows even while autocomplete is open.",
	"        const emitCursorMarker = this.focused;",
	"        const showPlaceholder = this.state.lines.length === 1 &&",
	'            this.state.lines[0] === "" &&',
	'            typeof this.theme.placeholderText === "string" &&',
	"            this.theme.placeholderText.length > 0;",
	"        const styleInput = typeof this.theme.input === \"function\" ? this.theme.input : (text) => text;",
	"        for (let visibleIndex = 0; visibleIndex < visibleLines.length; visibleIndex++) {",
	"            const layoutLine = visibleLines[visibleIndex];",
	"            const isFirstLayoutLine = this.scrollOffset + visibleIndex === 0;",
	"            let displayText = layoutLine.text;",
	"            let lineVisibleWidth = visibleWidth(layoutLine.text);",
	"            const isPlaceholderLine = showPlaceholder && isFirstLayoutLine;",
	"            if (isPlaceholderLine) {",
	"                const marker = emitCursorMarker ? CURSOR_MARKER : \"\";",
	"                const rawPlaceholder = this.theme.placeholderText;",
	'                const styledPlaceholder = typeof this.theme.placeholder === "function"',
	"                    ? this.theme.placeholder(rawPlaceholder)",
	"                    : rawPlaceholder;",
	"                displayText = marker + styledPlaceholder;",
	"                lineVisibleWidth = visibleWidth(rawPlaceholder);",
	"            }",
	"            else if (layoutLine.hasCursor && layoutLine.cursorPos !== undefined) {",
	'                const marker = emitCursorMarker ? CURSOR_MARKER : "";',
	"                const before = displayText.slice(0, layoutLine.cursorPos);",
	"                const after = displayText.slice(layoutLine.cursorPos);",
	"                displayText = styleInput(before) + marker + styleInput(after);",
	"            }",
	"            else {",
	"                displayText = styleInput(displayText);",
	"            }",
	"            // Calculate padding based on actual visible width",
	'            const padding = " ".repeat(Math.max(0, contentWidth - lineVisibleWidth));',
	"            const renderedLine = `${leftPadding}${displayText}${padding}${rightPadding}`;",
	"            result.push(bgColor ? applyBackgroundToLine(renderedLine, width, bgColor) : renderedLine);",
	"        }",
	"        // Render bottom padding row. When background fill is active, mimic the user-message block",
	"        // instead of the stock editor chrome.",
	"        const linesBelow = layoutLines.length - (this.scrollOffset + visibleLines.length);",
	"        if (bgColor) {",
	"            if (linesBelow > 0) {",
	"                const indicator = `  ↓ ${linesBelow} more`;",
	"                result.push(applyBackgroundToLine(indicator, width, bgColor));",
	"            }",
	"            else {",
	'                result.push(applyBackgroundToLine("", width, bgColor));',
	"            }",
	"        }",
	"        else if (linesBelow > 0) {",
	"            const indicator = `─── ↓ ${linesBelow} more `;",
	"            const bottomLine = renderBorderLine(indicator);",
	"            result.push(bottomLine);",
	"        }",
	"        else {",
	"            const bottomLine = horizontal.repeat(width);",
	"            result.push(bottomLine);",
	"        }",
	"        // Add autocomplete list if active",
	"        if (this.autocompleteState && this.autocompleteList) {",
	"            const autocompleteResult = this.autocompleteList.render(contentWidth);",
	"            for (const line of autocompleteResult) {",
	"                const lineWidth = visibleWidth(line);",
	'                const linePadding = " ".repeat(Math.max(0, contentWidth - lineWidth));',
	"                const autocompleteLine = `${leftPadding}${line}${linePadding}${rightPadding}`;",
	"                result.push(bgColor ? applyBackgroundToLine(autocompleteLine, width, bgColor) : autocompleteLine);",
	"            }",
	"        }",
	"        return result;",
	"    }",
].join("\n");

const EDITOR_THEME_BLOCK = [
	"export function getEditorTheme() {",
	"    return {",
	'        borderColor: (text) => " ".repeat(text.length),',
	'        bgColor: (text) => theme.bg("userMessageBg", text),',
	'        input: (text) => theme.fg("text", text),',
	'        placeholderText: "Type your message or /help for commands",',
	'        placeholder: (text) => theme.fg("dim", text),',
	"        selectList: getSelectListTheme(),",
	"    };",
	"}",
].join("\n");

function patchCurrentEditorSource(source) {
	const replacements = [
		[
			CURRENT_EDITOR_IMPORT,
			CURRENT_EDITOR_IMPORT_PATCHED,
		],
		[
			'        const horizontal = this.borderColor("─");\n        // Layout the text',
			'        const horizontal = this.borderColor("─");\n        const bgColor = this.theme.bgColor;\n        const styleInput = typeof this.theme.input === "function" ? this.theme.input : (text) => text;\n        // Layout the text',
		],
		[
			`        // Render top border (with scroll indicator if scrolled down)
        if (this.scrollOffset > 0) {
            const border = createScrollBorder("↑", this.scrollOffset, width);
            result.push(this.borderColor(border));
        }
        else {
            result.push(horizontal.repeat(width));
        }`,
			`        // Render top border (with scroll indicator if scrolled down)
        if (this.scrollOffset > 0) {
            const border = createScrollBorder("↑", this.scrollOffset, width);
            result.push(bgColor ? applyBackgroundToLine(\`  ↑ \${this.scrollOffset} more\`, width, bgColor) : this.borderColor(border));
        }
        else {
            result.push(bgColor ? applyBackgroundToLine("", width, bgColor) : horizontal.repeat(width));
        }`,
		],
		[
			"        const emitCursorMarker = this.focused;\n        for (const layoutLine of visibleLines) {",
			`        const emitCursorMarker = this.focused;
        const showPlaceholder = this.state.lines.length === 1 &&
            this.state.lines[0] === "" &&
            typeof this.theme.placeholderText === "string" &&
            this.theme.placeholderText.length > 0;
        for (const layoutLine of visibleLines) {`,
		],
		[
			`            let cursorInPadding = false;
            // Add cursor if this line has it
            if (layoutLine.hasCursor && layoutLine.cursorPos !== undefined) {`,
			`            let cursorInPadding = false;
            const isPlaceholderLine = showPlaceholder && this.scrollOffset === 0 && layoutLine === visibleLines[0];
            if (isPlaceholderLine) {
                const marker = emitCursorMarker ? CURSOR_MARKER : "";
                const placeholder = typeof this.theme.placeholder === "function"
                    ? this.theme.placeholder(this.theme.placeholderText)
                    : this.theme.placeholderText;
                displayText = marker + placeholder;
                lineVisibleWidth = visibleWidth(this.theme.placeholderText);
            }
            // Add cursor if this line has it
            else if (layoutLine.hasCursor && layoutLine.cursorPos !== undefined) {`,
		],
		[
			"                    displayText = before + marker + cursor + restAfter;",
			"                    displayText = styleInput(before) + marker + cursor + styleInput(restAfter);",
		],
		[
			'                    const cursor = `\\x1b[7m${firstGrapheme}\\x1b[0m`;',
			'                    const cursor = `\\x1b[7m${firstGrapheme}\\x1b[27m`;',
		],
		[
			'                    const cursor = "\\x1b[7m \\x1b[0m";',
			'                    const cursor = "\\x1b[7m \\x1b[27m";',
		],
		[
			"                    displayText = before + marker + cursor;",
			"                    displayText = styleInput(before) + marker + cursor;",
		],
		[
			`                }
            }
            // Calculate padding based on actual visible width`,
			`                }
            }
            else {
                displayText = styleInput(displayText);
            }
            // Calculate padding based on actual visible width`,
		],
		[
			'            result.push(`${leftPadding}${displayText}${padding}${lineRightPadding}`);',
			'            const renderedLine = `${leftPadding}${displayText}${padding}${lineRightPadding}`;\n            result.push(bgColor ? applyBackgroundToLine(renderedLine, width, bgColor) : renderedLine);',
		],
		[
			`        // Render bottom border (with scroll indicator if more content below)
        const linesBelow = layoutLines.length - (this.scrollOffset + visibleLines.length);
        if (linesBelow > 0) {
            const border = createScrollBorder("↓", linesBelow, width);
            result.push(this.borderColor(border));
        }
        else {
            result.push(horizontal.repeat(width));
        }`,
			`        // Render bottom border (with scroll indicator if more content below)
        const linesBelow = layoutLines.length - (this.scrollOffset + visibleLines.length);
        if (linesBelow > 0) {
            const border = createScrollBorder("↓", linesBelow, width);
            result.push(bgColor ? applyBackgroundToLine(\`  ↓ \${linesBelow} more\`, width, bgColor) : this.borderColor(border));
        }
        else {
            result.push(bgColor ? applyBackgroundToLine("", width, bgColor) : horizontal.repeat(width));
        }`,
		],
		[
			'                result.push(`${leftPadding}${line}${linePadding}${rightPadding}`);',
			'                const renderedLine = `${leftPadding}${line}${linePadding}${rightPadding}`;\n                result.push(bgColor ? applyBackgroundToLine(renderedLine, width, bgColor) : renderedLine);',
		],
	];
	const missing = replacements
		.map(([original], index) => source.includes(original) ? undefined : index + 1)
		.filter(Boolean);
	if (missing.length > 0) {
		throw new Error(`Unsupported Pi editor layout: missing required 0.82 patch anchors ${missing.join(", ")}`);
	}
	return replacements.reduce((patched, [original, replacement]) => patched.replace(original, replacement), source);
}

export function patchPiTuiSource(source) {
	if (source.includes("line = sliceByColumn(line, 0, width, true);")) {
		return source;
	}
	// Pi 0.84 split main-screen rendering out of tui.js. The base controller
	// no longer owns the overflow check; patch tui-main-screen.js separately.
	if (
		source.includes("export class TuiBase extends Container") &&
		source.includes("export const VIEWPORT_TUI")
	) {
		return source;
	}
	if (source.includes(OVERFLOW_THROW_BLOCK)) {
		return source.replace(OVERFLOW_THROW_BLOCK, OVERFLOW_TRUNCATE_BLOCK);
	}
	if (source.includes(OVERFLOW_THROW_BLOCK_AFTER_CLEAR)) {
		return source.replace(OVERFLOW_THROW_BLOCK_AFTER_CLEAR, OVERFLOW_TRUNCATE_BLOCK_AFTER_CLEAR);
	}
	if (source.includes(OVERFLOW_THROW_BLOCK_AFTER_CLEAR_CURRENT)) {
		return source.replace(OVERFLOW_THROW_BLOCK_AFTER_CLEAR_CURRENT, OVERFLOW_TRUNCATE_BLOCK_AFTER_CLEAR);
	}
	throw new Error("Unsupported Pi TUI layout: required overflow patch anchor was not found");
}

export function patchPiEditorSource(source) {
	if (source.includes(CURRENT_EDITOR_IMPORT) && !source.includes("const styleInput = typeof this.theme.input")) {
		return patchCurrentEditorSource(source);
	}
	if (source.includes("const styleInput = typeof this.theme.input")) {
		return source
			.replace(
				'                    const cursor = `\\x1b[7m${firstGrapheme}\\x1b[0m`;',
				'                    const cursor = `\\x1b[7m${firstGrapheme}\\x1b[27m`;',
			)
			.replace(
				'                    const cursor = "\\x1b[7m \\x1b[0m";',
				'                    const cursor = "\\x1b[7m \\x1b[27m";',
			);
	}
	let patched = source;
	let importsPatched = patched.includes("applyBackgroundToLine,");
	for (const [original, replacement] of EDITOR_IMPORT_PAIRS) {
		if (patched.includes(original)) {
			patched = patched.replace(original, replacement);
			importsPatched = true;
		}
	}
	if (!importsPatched) {
		throw new Error("Unsupported Pi editor layout: required import patch anchor was not found");
	}
	const rendered = patched.replace(
		/    render\(width\) \{[\s\S]*?\n    handleInput\(data\) \{/m,
		`${EDITOR_RENDER_BLOCK}\n    handleInput(data) {`,
	);
	if (rendered === patched || !rendered.includes("const styleInput = typeof this.theme.input")) {
		throw new Error("Unsupported Pi editor layout: required render patch anchor was not found");
	}
	return rendered;
}

export function patchPiInteractiveThemeSource(source) {
	if (source.includes('theme.fg("inputText"')) {
		return source;
	}
	let patched = source;
	if (
		!patched.includes('bgColor: (text) => theme.bg("userMessageBg", text),') ||
		!patched.includes('input: (text) => theme.fg("text", text),')
	) {
		const normalized = patched.replace(
			/export function getEditorTheme\(\) \{[\s\S]*?\n\}\nexport function getSettingsListTheme\(\) \{/m,
			`${EDITOR_THEME_BLOCK}\nexport function getSettingsListTheme() {`,
		);
		if (
			normalized === patched ||
			!normalized.includes('bgColor: (text) => theme.bg("userMessageBg", text),') ||
			!normalized.includes('input: (text) => theme.fg("text", text),')
		) {
			throw new Error("Unsupported Pi interactive theme layout: required editor-theme patch anchor was not found");
		}
		patched = normalized;
	}
	// ResearchX: the input editor renders typed text with the theme's
	// "inputText" color (falls back to "text" when a theme omits it), so the
	// input area can carry its own accent without recoloring all text.
	// The editor frame uses "borderAccent" instead of invisible spaces.
	if (!patched.includes('theme.fg("inputText"')) {
		patched = patched
			.replace(
				'input: (text) => theme.fg("text", text),',
				'input: (text) => theme.fg("inputText", text),',
			)
			.replace(
				"searchMatchText: colors.searchMatchText ?? colors.text,",
				'searchMatchText: colors.searchMatchText ?? colors.text,\n        inputText: colors.inputText ?? colors.text,',
			)
			.replace(
				"searchMatchText: fgColors.searchMatchText ?? fgColors.text,",
				'searchMatchText: fgColors.searchMatchText ?? fgColors.text,\n            inputText: fgColors.inputText ?? fgColors.text,',
			);
	}
	if (!patched.includes('borderColor: (text) => theme.fg("borderAccent", text),')) {
		const before = patched;
		patched = patched.replace(
			'borderColor: (text) => " ".repeat(text.length),',
			'borderColor: (text) => theme.fg("borderAccent", text),',
		);
		if (patched === before) {
			throw new Error("Unsupported Pi interactive theme layout: required editor-border patch anchor was not found");
		}
	}
	if (!patched.includes('theme.fg("inputText"')) {
		throw new Error("Unsupported Pi interactive theme layout: required input-text patch anchor was not found");
	}
	return patched;
}

// ResearchX: allow themes to define an optional "inputText" color for the
// input editor. Unknown color keys fail Pi's theme-schema validation, so the
// schema itself must accept the key (optional, falls back to "text").
const THEME_SCHEMA_INPUT_TEXT_ANCHOR = `"thinkingText": {
					"$ref": "#/$defs/colorValue",
					"description": "Thinking block text color"
				},`;
const THEME_SCHEMA_INPUT_TEXT_PATCHED = `"thinkingText": {
					"$ref": "#/$defs/colorValue",
					"description": "Thinking block text color"
				},
				"inputText": {
					"$ref": "#/$defs/colorValue",
					"description": "Input editor text color (falls back to text when omitted)"
				},`;

export function patchPiThemeSchemaSource(source) {
	if (source.includes('"inputText"')) {
		return source;
	}
	if (!source.includes(THEME_SCHEMA_INPUT_TEXT_ANCHOR)) {
		throw new Error("Unsupported Pi theme-schema layout: required thinkingText patch anchor was not found");
	}
	return source.replace(THEME_SCHEMA_INPUT_TEXT_ANCHOR, THEME_SCHEMA_INPUT_TEXT_PATCHED);
}

const INTERACTIVE_UPDATE_NOTICE_SOURCE = `    showPackageUpdateNotification(packages) {
        const action = theme.fg("accent", \`\${APP_NAME} update --extensions\`);`;
const INTERACTIVE_UPDATE_NOTICE_PATCHED_SOURCE = `    showPackageUpdateNotification(packages) {
        // ResearchX: package update notices use the full update command.
        const action = theme.fg("accent", \`\${APP_NAME} update\`);`;

export function patchPiInteractiveUpdateNoticeSource(source) {
	if (
		source.includes(INTERACTIVE_UPDATE_NOTICE_PATCHED_SOURCE) &&
		!source.includes(INTERACTIVE_UPDATE_NOTICE_SOURCE)
	) {
		return source;
	}
	const firstAnchor = source.indexOf(INTERACTIVE_UPDATE_NOTICE_SOURCE);
	if (
		firstAnchor === -1 ||
		source.indexOf(INTERACTIVE_UPDATE_NOTICE_SOURCE, firstAnchor + INTERACTIVE_UPDATE_NOTICE_SOURCE.length) !== -1
	) {
		throw new Error(
			"Unsupported Pi interactive update notice layout: required unique package-update anchor was not found",
		);
	}
	return source.replace(INTERACTIVE_UPDATE_NOTICE_SOURCE, INTERACTIVE_UPDATE_NOTICE_PATCHED_SOURCE);
}

// --- Slash-command preview expansion -------------------------------------
//
// When the "/" autocomplete menu is open, the highlighted command expands its
// full instruction text (prompt template body or skill markdown) below the
// list. Three files cooperate:
//   1. interactive-mode.js attaches `preview` to template and skill commands
//   2. autocomplete.js carries `preview` through suggestion filtering
//   3. select-list.js renders the highlighted item's preview

const SELECT_LIST_IMPORT = 'import { truncateToWidth, visibleWidth } from "../utils.js";';
const SELECT_LIST_IMPORT_PATCHED = 'import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "../utils.js";';

const SELECT_LIST_RENDER_TAIL = `        // Add scroll indicators if needed
        if (startIndex > 0 || endIndex < this.filteredItems.length) {
            const scrollText = \`  (\${this.selectedIndex + 1}/\${this.filteredItems.length})\`;
            // Truncate if too long for terminal
            lines.push(this.theme.scrollInfo(truncateToWidth(scrollText, width - 2, "")));
        }
        return lines;
    }`;

const SELECT_LIST_RENDER_TAIL_PATCHED = `        // Add scroll indicators if needed
        if (startIndex > 0 || endIndex < this.filteredItems.length) {
            const scrollText = \`  (\${this.selectedIndex + 1}/\${this.filteredItems.length})\`;
            // Truncate if too long for terminal
            lines.push(this.theme.scrollInfo(truncateToWidth(scrollText, width - 2, "")));
        }
        // ResearchX: expand the highlighted command's full instructions below
        // the list so users can preview exactly what the command sends.
        const selectedPreviewItem = this.filteredItems[this.selectedIndex];
        const previewText = typeof selectedPreviewItem?.preview === "string"
            ? selectedPreviewItem.preview.trim().slice(0, 4000)
            : "";
        if (previewText.length > 0 && width > 24) {
            lines.push(this.theme.description(""));
            const wrappedPreview = wrapTextWithAnsi(previewText, Math.max(20, width - 4));
            const maxPreviewLines = 8;
            for (const previewLine of wrappedPreview.slice(0, maxPreviewLines)) {
                lines.push(this.theme.description(\`  \${previewLine}\`));
            }
            if (wrappedPreview.length > maxPreviewLines) {
                lines.push(this.theme.description(\`  ↓ \${wrappedPreview.length - maxPreviewLines} more lines\`));
            }
        }
        return lines;
    }`;

export function patchPiSelectListPreviewSource(source) {
	if (source.includes("const previewText = typeof selectedPreviewItem?.preview")) {
		return source;
	}
	let patched = source;
	if (patched.includes(SELECT_LIST_IMPORT)) {
		patched = patched.replace(SELECT_LIST_IMPORT, SELECT_LIST_IMPORT_PATCHED);
	}
	else if (!patched.includes(SELECT_LIST_IMPORT_PATCHED)) {
		throw new Error("Unsupported Pi select-list layout: required utils import anchor was not found");
	}
	if (!patched.includes(SELECT_LIST_RENDER_TAIL)) {
		throw new Error("Unsupported Pi select-list layout: required render tail anchor was not found");
	}
	return patched.replace(SELECT_LIST_RENDER_TAIL, SELECT_LIST_RENDER_TAIL_PATCHED);
}

const AUTOCOMPLETE_COMMAND_ITEM_SOURCE = `                    return {
                        name,
                        label: name,
                        description: fullDesc || undefined,
                    };`;
const AUTOCOMPLETE_COMMAND_ITEM_PATCHED = `                    return {
                        name,
                        label: name,
                        description: fullDesc || undefined,
                        ...(cmd.preview && { preview: cmd.preview }),
                    };`;

const AUTOCOMPLETE_FILTERED_MAP_SOURCE = `                const filtered = fuzzyFilter(commandItems, prefix, (item) => item.name).map((item) => ({
                    value: item.name,
                    label: item.label,
                    ...(item.description && { description: item.description }),
                }));`;
const AUTOCOMPLETE_FILTERED_MAP_PATCHED = `                const filtered = fuzzyFilter(commandItems, prefix, (item) => item.name).map((item) => ({
                    value: item.name,
                    label: item.label,
                    ...(item.description && { description: item.description }),
                    ...(item.preview && { preview: item.preview }),
                }));`;

export function patchPiAutocompletePreviewSource(source) {
	if (source.includes("...(item.preview && { preview: item.preview })")) {
		return source;
	}
	const missing = [AUTOCOMPLETE_COMMAND_ITEM_SOURCE, AUTOCOMPLETE_FILTERED_MAP_SOURCE].findIndex(
		(anchor) => !source.includes(anchor),
	);
	if (missing !== -1) {
		throw new Error(`Unsupported Pi autocomplete layout: required command-preview anchor ${missing + 1} was not found`);
	}
	return source
		.replace(AUTOCOMPLETE_COMMAND_ITEM_SOURCE, AUTOCOMPLETE_COMMAND_ITEM_PATCHED)
		.replace(AUTOCOMPLETE_FILTERED_MAP_SOURCE, AUTOCOMPLETE_FILTERED_MAP_PATCHED);
}

const COMMAND_PREVIEW_HELPER = `/** ResearchX: read a command's markdown file and strip frontmatter for preview. */
function readCommandPreviewFile(filePath) {
	try {
		if (!filePath) {
			return undefined;
		}
		const raw = fs.readFileSync(filePath, "utf-8");
		const withoutFrontmatter = raw.startsWith("---")
			? raw.slice(raw.indexOf("\\n---", 3) + 4).replace(/^\\r?\\n/, "")
			: raw;
		const trimmed = withoutFrontmatter.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	catch {
		return undefined;
	}
}

/** Composition root for selecting the interactive terminal renderer. */
export function createInteractiveTui(options) {`;

const COMMAND_PREVIEW_TEMPLATE_COMMANDS_SOURCE = `        const templateCommands = this.session.promptTemplates.map((cmd) => ({
            name: cmd.name,
            description: this.prefixAutocompleteDescription(cmd.description, cmd.sourceInfo),
            ...(cmd.argumentHint && { argumentHint: cmd.argumentHint }),
        }));`;
const COMMAND_PREVIEW_TEMPLATE_COMMANDS_PATCHED = `        const templateCommands = this.session.promptTemplates.map((cmd) => ({
            name: cmd.name,
            description: this.prefixAutocompleteDescription(cmd.description, cmd.sourceInfo),
            ...(cmd.argumentHint && { argumentHint: cmd.argumentHint }),
            ...(cmd.content && { preview: cmd.content }),
        }));`;

const COMMAND_PREVIEW_SKILL_COMMANDS_SOURCE = `                skillCommandList.push({
                    name: commandName,
                    description: this.prefixAutocompleteDescription(skill.description, skill.sourceInfo),
                });`;
const COMMAND_PREVIEW_SKILL_COMMANDS_PATCHED = `                const skillPreview = readCommandPreviewFile(skill.filePath);
                skillCommandList.push({
                    name: commandName,
                    description: this.prefixAutocompleteDescription(skill.description, skill.sourceInfo),
                    ...(skillPreview && { preview: skillPreview }),
                });`;

export function patchPiCommandPreviewSource(source) {
	if (source.includes("function readCommandPreviewFile(filePath)")) {
		return source;
	}
	const anchors = [COMMAND_PREVIEW_TEMPLATE_COMMANDS_SOURCE, COMMAND_PREVIEW_SKILL_COMMANDS_SOURCE];
	const missing = anchors.findIndex((anchor) => !source.includes(anchor));
	if (missing !== -1) {
		throw new Error(`Unsupported Pi interactive layout: required command-preview anchor ${missing + 1} was not found`);
	}
	let patched = source.replace(
		"/** Composition root for selecting the interactive terminal renderer. */\nexport function createInteractiveTui(options) {",
		COMMAND_PREVIEW_HELPER,
	);
	patched = patched
		.replace(COMMAND_PREVIEW_TEMPLATE_COMMANDS_SOURCE, COMMAND_PREVIEW_TEMPLATE_COMMANDS_PATCHED)
		.replace(COMMAND_PREVIEW_SKILL_COMMANDS_SOURCE, COMMAND_PREVIEW_SKILL_COMMANDS_PATCHED);
	return patched;
}
