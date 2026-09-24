import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerAlphaTools } from "./research-tools/alpha.js";
import { registerCitationIntegrityTools } from "./research-tools/citation-integrity.js";
import { registerChemistrySketcherTool } from "./research-tools/chemistry-sketcher.js";
import { registerCurrentDateResearchContext } from "./research-tools/current-date.js";
import { registerDiscoveryCommands } from "./research-tools/discovery.js";
import { installCustomProviders, registerCustomProviderCommand } from "./research-tools/custom-providers.js";
import { registerResearchXModelCommand } from "./research-tools/researchx-model.js";
import { registerSettingsCommand } from "./research-tools/settings.js";
import { installResearchXHeader } from "./research-tools/header.js";
import { registerHelpCommand } from "./research-tools/help.js";
import { registerHuggingFaceTools } from "./research-tools/huggingface.js";
import { registerKaggleTools } from "./research-tools/kaggle.js";
import { registerHumanCheckpointTools } from "./research-tools/human-checkpoint.js";
import { registerInitCommand, registerOutputsCommand } from "./research-tools/project.js";
import { registerServiceTierControls } from "./research-tools/service-tier.js";
import { registerScienceDatabaseTools } from "./research-tools/science-databases.js";
import { registerModelEndpointTools } from "./research-tools/model-endpoints.js";
import { registerThinkingCommand } from "./research-tools/thinking.js";
import { registerTinyfishTools } from "./research-tools/tinyfish.js";
import { registerWorkbenchConnectorTools } from "./research-tools/workbench-connectors.js";
import { registerWorkbenchContextTool } from "./research-tools/workbench-context.js";

export default function researchTools(pi: ExtensionAPI): void {
	const cache: { agentSummaryPromise?: Promise<{ agents: string[]; chains: string[] }> } = {};

	// Pi 0.66.x folds post-switch/resume lifecycle into session_start.
	pi.on("session_start", async (_event, ctx) => {
		await installResearchXHeader(pi, ctx, cache);
		await installCustomProviders(pi, ctx);
	});

	registerAlphaTools(pi);
	registerCitationIntegrityTools(pi);
	registerChemistrySketcherTool(pi);
	registerCurrentDateResearchContext(pi);
	registerCustomProviderCommand(pi);
	registerHuggingFaceTools(pi);
	registerKaggleTools(pi);
	registerHumanCheckpointTools(pi);
	registerDiscoveryCommands(pi);
	registerResearchXModelCommand(pi);
	registerSettingsCommand(pi);
	registerHelpCommand(pi);
	registerInitCommand(pi);
	registerOutputsCommand(pi);
	registerServiceTierControls(pi);
	registerScienceDatabaseTools(pi);
	registerModelEndpointTools(pi);
	registerThinkingCommand(pi);
	registerTinyfishTools(pi);
	registerWorkbenchConnectorTools(pi);
	registerWorkbenchContextTool(pi);
}
