import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { readWorkbenchSettings, type WorkbenchSettings } from "./settings-store.js";
import type { WorkbenchComputeProvider } from "./types.js";

function kaggleCredentialStatus(): WorkbenchComputeProvider["status"] {
	return (process.env.KAGGLE_USERNAME?.trim() && process.env.KAGGLE_KEY?.trim()) || kaggleConfigExists()
		? "configured"
		: "available";
}

function kaggleConfigExists(): boolean {
	try {
		return existsSync(resolve(homedir(), ".kaggle", "kaggle.json"));
	} catch {
		return false;
	}
}

function kaggleCredentialDetail(): string {
	if (process.env.KAGGLE_USERNAME?.trim() && process.env.KAGGLE_KEY?.trim()) return "KAGGLE_USERNAME / KAGGLE_KEY";
	if (kaggleConfigExists()) return "~/.kaggle/kaggle.json";
	return "KAGGLE_USERNAME / KAGGLE_KEY or ~/.kaggle/kaggle.json";
}

function computeProviderEnabled(settings: WorkbenchSettings, providerId: string, fallback: boolean): boolean {
	return settings.computeProviderPreferences.find((item) => item.id === providerId)?.enabled ?? fallback;
}

function computeToggleAction(enabled: boolean): WorkbenchComputeProvider["actions"] {
	return [{
		id: enabled ? "disable" : "enable",
		label: enabled ? "Disable" : "Enable",
		description: enabled
			? "Hide this provider from active workbench compute selection and runtime context."
			: "Expose this provider to active workbench compute selection and runtime context.",
	}];
}

export function buildComputeProviders(workingDir: string): WorkbenchComputeProvider[] {
	const settings = readWorkbenchSettings(workingDir);
	const kaggleStatus = kaggleCredentialStatus();
	const nvidiaStatus = process.env.NVIDIA_API_KEY?.trim() ? "configured" as const : "available" as const;
	const baseProviders: WorkbenchComputeProvider[] = [
		{
			id: "local-workspace",
			name: "Local Workspace",
			family: "ResearchX",
			status: "available",
			description: "Indexes research artifacts from this checkout without sending files to a hosted dashboard.",
			capabilities: ["outputs", "papers", "notes", "plans", "drafts"],
			enabled: computeProviderEnabled(settings, "local-workspace", true),
			checked: computeProviderEnabled(settings, "local-workspace", true),
			tierType: "local",
			detail: "Workspace-local files and generated research artifacts",
			actions: computeToggleAction(computeProviderEnabled(settings, "local-workspace", true)),
		},
		{
			id: "pi-subagents",
			name: "Pi Research Agents",
			family: "Pi",
			status: "configured",
			description: "Bundled researcher, reviewer, writer, and verifier agents remain the execution layer.",
			capabilities: ["researcher", "reviewer", "writer", "verifier"],
			enabled: computeProviderEnabled(settings, "pi-subagents", true),
			checked: computeProviderEnabled(settings, "pi-subagents", true),
			tierType: "session",
			detail: ".researchx/agents",
			actions: computeToggleAction(computeProviderEnabled(settings, "pi-subagents", true)),
		},
		{
			id: "artifact-provenance",
			name: "Artifact Provenance",
			family: "Verification",
			status: "read-only",
			description: "Surfaces provenance sidecars, score audits, and lab-notebook checkpoints beside each run.",
			capabilities: ["sidecars", "verification checks", "lab notebook"],
			enabled: true,
			checked: true,
			tierType: "local",
			detail: "Always on for artifact history and verification records",
			managed: true,
		},
		{
			id: "kaggle",
			name: "Kaggle Kernels",
			family: "Cloud provider",
			status: kaggleStatus,
			description: kaggleStatus === "configured"
				? "Default experiment backend: local code pushed to Kaggle GPU kernels and monitored to completion."
				: "Default experiment backend. Set KAGGLE_USERNAME + KAGGLE_KEY or place a token at ~/.kaggle/kaggle.json.",
			capabilities: ["gpu", "kernels", "python", "notebook"],
			enabled: computeProviderEnabled(settings, "kaggle", true),
			checked: computeProviderEnabled(settings, "kaggle", true),
			tierType: "cloud",
			detail: kaggleCredentialDetail(),
			diagnostics: [
				"Auth: KAGGLE_USERNAME + KAGGLE_KEY, or ~/.kaggle/kaggle.json (kaggle.com → Settings → API)."
				+ " Execution: write code locally under outputs/experiments/<slug>/, push with researchx_kaggle_push,"
				+ " monitor with researchx_kaggle_status every 10 minutes, fetch with researchx_kaggle_output.",
			],
			actions: computeToggleAction(computeProviderEnabled(settings, "kaggle", true)),
		},
		{
			id: "nvidia-bionemo",
			name: "NVIDIA BioNeMo NIM",
			family: "Model endpoint",
			status: nvidiaStatus,
			description: "Executable scientific model endpoint path for hosted ESMFold and self-hosted AlphaFold2 NIM protein-structure inference.",
			capabilities: ["biology", "inference", "esmfold", "alphafold2"],
			enabled: computeProviderEnabled(settings, "nvidia-bionemo", true),
			checked: computeProviderEnabled(settings, "nvidia-bionemo", true),
			tierType: "cloud",
			detail: "NVIDIA_API_KEY",
			diagnostics: [
				process.env.NVIDIA_API_KEY?.trim()
					? "Auth: NVIDIA_API_KEY is present; the value is not displayed."
					: "Auth: NVIDIA_API_KEY is not present in the server environment.",
				"Execution: researchx_model_endpoint_call runs hosted ESMFold when NVIDIA_API_KEY is present and self-hosted AlphaFold2 NIM by endpointUrl.",
				"Artifacts: endpoint responses are saved under outputs/model-endpoints with a provenance sidecar.",
			],
			tools: [{ name: "researchx_model_endpoint_call", description: "Run hosted ESMFold or self-hosted AlphaFold2 NIM calls and save provenance-backed outputs." }],
			actions: computeToggleAction(computeProviderEnabled(settings, "nvidia-bionemo", true)),
		},
	];
	const sshProviders: WorkbenchComputeProvider[] = settings.computeHosts.map((host) => {
		const id = `ssh:${host.id}`;
		const enabled = computeProviderEnabled(settings, id, true);
		return {
			id,
			name: host.name,
			family: "SSH compute",
			status: "configured",
			description: host.guidance || `Remote workstation or HPC compute host ${host.host}.`,
			capabilities: ["ssh", host.scheduler || "remote", "hpc"].filter((item): item is string => Boolean(item)),
			enabled,
			checked: enabled,
			tierType: "cloud",
			detail: [
				host.user ? `${host.user}@${host.host}` : host.host,
				host.port ? `port ${host.port}` : undefined,
				host.scheduler,
				host.scratchRoot,
			].filter(Boolean).join(" | "),
			settingsCollection: "computeHosts",
			settingsRecordId: host.id,
			actions: [
				...(computeToggleAction(enabled) ?? []),
				{ id: "remove", label: "Remove", description: "Remove this SSH compute host from ResearchX settings." },
			],
		};
	});
	return [...baseProviders, ...sshProviders];
}
