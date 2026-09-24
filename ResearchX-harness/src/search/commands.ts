import {
	getPiWebAccessStatus,
	savePiWebAccessConfig,
	type PiWebAccessConfig,
	type PiWebSearchProvider,
} from "../pi/web-access.js";
import { printInfo } from "../ui/terminal.js";

const SEARCH_PROVIDERS: PiWebSearchProvider[] = ["auto", "perplexity", "exa", "gemini", "tinyfish"];
const PROVIDER_API_KEY_FIELDS: Partial<Record<PiWebSearchProvider, keyof PiWebAccessConfig>> = {
	perplexity: "perplexityApiKey",
	exa: "exaApiKey",
	gemini: "geminiApiKey",
	tinyfish: "tinyfishApiKey",
};

export function printSearchStatus(status = getPiWebAccessStatus()): void {
	const configPathSuffix = status.configExists ? "" : " (not created yet)";
	printInfo("Managed by: pi-web-access");
	printInfo(`Search route: ${status.routeLabel}`);
	printInfo(`Request route: ${status.requestProvider}`);
	printInfo(`Search workflow: ${status.workflow}`);
	printInfo(`Perplexity API configured: ${status.perplexityConfigured ? "yes" : "no"}`);
	printInfo(`Exa API configured: ${status.exaConfigured ? "yes" : "no"}`);
	printInfo(`Gemini API configured: ${status.geminiApiConfigured ? "yes" : "no"}`);
	printInfo(`TinyFish API configured: ${status.tinyfishConfigured ? "yes" : "no"}`);
	printInfo(`Gemini browser fallback: ${status.geminiBrowserEnabled ? "enabled" : "disabled"}`);
	if (status.geminiBrowserEnabled && status.chromeProfile) {
		printInfo(`Gemini browser profile: ${status.chromeProfile}`);
	}
	printInfo(`Config path: ${status.configPath}${configPathSuffix}`);
	if (!status.configExists) {
		printInfo("Not configured yet. Run one of:");
		printInfo("  researchx search set auto");
		printInfo("  researchx search set perplexity <api-key>");
		printInfo("  researchx search set exa <api-key>");
		printInfo("  researchx search set gemini <api-key>");
		printInfo("  researchx search set tinyfish <api-key>");
	}
}

export function setSearchProvider(provider: PiWebSearchProvider, apiKey?: string): void {
	if (!SEARCH_PROVIDERS.includes(provider)) {
		throw new Error(`Usage: researchx search set <${SEARCH_PROVIDERS.join("|")}> [api-key]`);
	}
	if (apiKey !== undefined && provider === "auto") {
		throw new Error("The auto provider does not use an API key. Usage: researchx search set auto");
	}

	const updates: Partial<Record<keyof PiWebAccessConfig, unknown>> = {
		provider,
		searchProvider: provider,
		workflow: "none",
		geminiBrowser: false,
		route: undefined,
	};
	const apiKeyField = PROVIDER_API_KEY_FIELDS[provider];
	if (apiKeyField && apiKey !== undefined) {
		updates[apiKeyField] = apiKey;
	}
	savePiWebAccessConfig(updates);

	const status = getPiWebAccessStatus();
	console.log(`Web search provider set to ${status.routeLabel}.`);
	console.log(`Config path: ${status.configPath}`);
}

export function clearSearchConfig(): void {
	savePiWebAccessConfig({
		provider: undefined,
		searchProvider: undefined,
		route: undefined,
		workflow: "none",
		geminiBrowser: false,
	});

	const status = getPiWebAccessStatus();
	console.log(`Web search provider reset to ${status.routeLabel}.`);
	console.log(`Config path: ${status.configPath}`);
}
