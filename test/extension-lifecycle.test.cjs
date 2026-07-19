const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createJiti } = require("jiti");

const jiti = createJiti(__filename);
const piGoal = jiti("../.pi/extensions/pi-goal/index.ts").default;

function createHarness() {
	const handlers = new Map();
	const tools = new Map();
	const commands = new Map();
	const sentMessages = [];
	const entries = [];
	const notifications = [];
	let activeTools = [];

	const pi = {
		on(name, handler) {
			handlers.set(name, handler);
		},
		registerMessageRenderer() {},
		registerTool(tool) {
			tools.set(tool.name, tool);
		},
		registerCommand(name, command) {
			commands.set(name, command);
		},
		getActiveTools() {
			return activeTools;
		},
		setActiveTools(next) {
			activeTools = next;
		},
		appendEntry(customType, data) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage(message, options) {
			sentMessages.push({ message, options });
		},
	};

	const ctx = {
		sessionManager: {
			getBranch() {
				return entries;
			},
			getEntries() {
				return entries;
			},
		},
		ui: {
			setStatus() {},
			notify(message, level) {
				notifications.push({ message, level });
			},
			async confirm() {
				return true;
			},
		},
		isIdle() {
			return true;
		},
		hasPendingMessages() {
			return false;
		},
	};

	piGoal(pi);
	return { commands, ctx, entries, handlers, notifications, sentMessages, tools };
}

function usage(totalTokens = 10) {
	return { input: totalTokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens };
}

function nextMicrotask() {
	return new Promise((resolve) => setImmediate(resolve));
}

test("settled provider error pauses an active goal without another continuation", async () => {
	const harness = createHarness();
	await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);
	await harness.tools.get("create_goal").execute("tool-1", { objective: "finish safely" }, undefined, undefined, harness.ctx);
	const messagesBeforeFailure = harness.sentMessages.length;

	await harness.handlers.get("turn_start")({}, harness.ctx);
	await harness.handlers.get("turn_end")(
		{ message: { role: "assistant", stopReason: "error", errorMessage: "context_too_large", usage: usage(0) } },
		harness.ctx,
	);
	await harness.handlers.get("agent_settled")({}, harness.ctx);
	await nextMicrotask();

	assert.equal(harness.sentMessages.length, messagesBeforeFailure);
	assert.equal(harness.entries.at(-1).data.goal.status, "paused");
	assert.match(harness.notifications.at(-1).message, /compact or switch models/);
});

test("successful settled run keeps autonomous continuation working", async () => {
	const harness = createHarness();
	await harness.handlers.get("session_start")({ reason: "startup" }, harness.ctx);
	await harness.tools.get("create_goal").execute("tool-1", { objective: "finish safely" }, undefined, undefined, harness.ctx);
	const messagesBeforeSuccess = harness.sentMessages.length;

	await harness.handlers.get("turn_start")({}, harness.ctx);
	await harness.handlers.get("turn_end")(
		{ message: { role: "assistant", stopReason: "stop", usage: usage() } },
		harness.ctx,
	);
	await harness.handlers.get("agent_settled")({}, harness.ctx);
	await nextMicrotask();

	assert.equal(harness.entries.at(-1).data.goal.status, "active");
	assert.equal(harness.sentMessages.length, messagesBeforeSuccess + 1);
	assert.equal(harness.sentMessages.at(-1).message.details.kind, "continuation");
});
