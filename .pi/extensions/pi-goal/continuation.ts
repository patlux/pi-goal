export type AssistantOutcome = "success" | "error" | "aborted";

export function assistantOutcome(role: string, stopReason: string | undefined): AssistantOutcome | null {
	if (role !== "assistant" || !stopReason) return null;
	if (stopReason === "error" || stopReason === "aborted") return stopReason;
	return "success";
}

export function shouldPauseGoalAfterSettled(outcome: AssistantOutcome | null): boolean {
	return outcome === "error" || outcome === "aborted";
}

export function shouldContinueGoalAfterSettled(outcome: AssistantOutcome | null): boolean {
	return outcome === "success";
}
