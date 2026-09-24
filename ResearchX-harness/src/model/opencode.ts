const OPENCODE_FREE_TIER_ERROR = /free[\s_-]*tier|freetiererror/i;
const OPENCODE_APP_ONLY_ERROR = /within\s+opencode|from\s+within\s+opencode|only\s+be\s+used\s+from/i;

export function isOpenCodeFreeTierPolicyError(message: string): boolean {
	return /opencode/i.test(message) && OPENCODE_FREE_TIER_ERROR.test(message) && OPENCODE_APP_ONLY_ERROR.test(message);
}

export function formatOpenCodeProviderError(message: string): string {
	if (!isOpenCodeFreeTierPolicyError(message)) {
		return message;
	}

	return `${message} OpenCode's free-tier restriction is enforced upstream and cannot be fixed by changing headers or app identity. Use a paid/authorized OpenCode Zen or OpenCode Go API key, or choose another provider.`;
}
