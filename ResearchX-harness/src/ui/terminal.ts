import { RESEARCHX_ASCII_LOGO } from "../../logo.mjs";

export const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function rgb(red: number, green: number, blue: number): string {
	return `\x1b[38;2;${red};${green};${blue}m`;
}

// Match the outer CLI to the ResearchX blue/iris theme instead of the old sage-gray palette.
const INK = rgb(170, 139, 169);
const STONE = rgb(170, 139, 169);
export const ASH = rgb(170, 139, 169);
const DARK_ASH = rgb(57, 72, 94);
export const SAGE = rgb(109, 143, 196);
const AZURE = rgb(109, 143, 196);
const ROSE = rgb(230, 126, 128);

function paint(text: string, ...codes: string[]): string {
	return `${codes.join("")}${text}${RESET}`;
}

export function printInfo(text: string): void {
	console.log(paint(`  ${text}`, ASH));
}

export function printSuccess(text: string): void {
	console.log(paint(`✓ ${text}`, SAGE, BOLD));
}

export function printWarning(text: string): void {
	console.log(paint(`⚠ ${text}`, STONE, BOLD));
}

export function printError(text: string): void {
	console.log(paint(`✗ ${text}`, ROSE, BOLD));
}

export function printSection(title: string): void {
	console.log("");
	console.log(paint(`◆ ${title}`, AZURE, BOLD));
}

export function printAsciiHeader(subtitleLines: string[] = []): void {
	console.log("");
	for (const line of RESEARCHX_ASCII_LOGO) {
		console.log(paint(`  ${line}`, AZURE, BOLD));
	}
	for (const line of subtitleLines) {
		console.log(paint(`  ${line}`, ASH));
	}
	console.log("");
}

export function printPanel(title: string, subtitleLines: string[] = []): void {
	const inner = 53;
	const border = "─".repeat(inner + 2);
	const renderLine = (text: string, color: string, bold = false): string => {
		const content = text.length > inner ? `${text.slice(0, inner - 3)}...` : text;
		const codes = bold ? `${color}${BOLD}` : color;
		return `${DARK_ASH}${BOLD}│${RESET} ${codes}${content.padEnd(inner)}${RESET} ${DARK_ASH}${BOLD}│${RESET}`;
	};

	console.log("");
	console.log(paint(`┌${border}┐`, DARK_ASH, BOLD));
	console.log(renderLine(title, AZURE, true));
	if (subtitleLines.length > 0) {
		console.log(paint(`├${border}┤`, DARK_ASH, BOLD));
		for (const line of subtitleLines) {
			console.log(renderLine(line, INK));
		}
	}
	console.log(paint(`└${border}┘`, DARK_ASH, BOLD));
	console.log("");
}
