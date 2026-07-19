const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createJiti } = require("jiti");

const jiti = createJiti(__filename);
const {
	assistantOutcome,
	shouldContinueGoalAfterSettled,
	shouldPauseGoalAfterSettled,
} = jiti("../.pi/extensions/pi-goal/continuation.ts");

test("assistantOutcome classifies successful, error, and aborted assistant turns", () => {
	assert.equal(assistantOutcome("assistant", "stop"), "success");
	assert.equal(assistantOutcome("assistant", "toolUse"), "success");
	assert.equal(assistantOutcome("assistant", "error"), "error");
	assert.equal(assistantOutcome("assistant", "aborted"), "aborted");
});

test("assistantOutcome ignores non-assistant and incomplete messages", () => {
	assert.equal(assistantOutcome("user", undefined), null);
	assert.equal(assistantOutcome("toolResult", undefined), null);
	assert.equal(assistantOutcome("assistant", undefined), null);
});

test("settled provider failures pause instead of continuing", () => {
	for (const outcome of ["error", "aborted"]) {
		assert.equal(shouldPauseGoalAfterSettled(outcome), true);
		assert.equal(shouldContinueGoalAfterSettled(outcome), false);
	}
});

test("only a successful settled assistant turn continues the goal", () => {
	assert.equal(shouldPauseGoalAfterSettled("success"), false);
	assert.equal(shouldContinueGoalAfterSettled("success"), true);
	assert.equal(shouldPauseGoalAfterSettled(null), false);
	assert.equal(shouldContinueGoalAfterSettled(null), false);
});
