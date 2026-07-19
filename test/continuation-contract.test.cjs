const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const indexSource = readFileSync(join(__dirname, "../.pi/extensions/pi-goal/index.ts"), "utf8");

test("persisting a non-active goal cancels any queued continuation", () => {
	assert.match(
		indexSource,
		/if \(next\?\.status !== "active"\) \{\s*continuationQueued = false;\s*\}/,
	);
});

test("goal continuation waits for Pi retry and compaction recovery to settle", () => {
	assert.match(indexSource, /pi\.on\("agent_settled"/);
	assert.doesNotMatch(indexSource, /pi\.on\("agent_end"/);
});

test("settled provider errors pause the goal without queueing another turn", () => {
	assert.match(indexSource, /shouldPauseGoalAfterSettled\(outcome\)/);
	assert.match(indexSource, /status: "paused" as const/);
	assert.match(indexSource, /compact or switch models if needed/);
});
