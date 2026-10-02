const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createJiti } = require('jiti');
const jiti = createJiti(__filename);
const piGoal = jiti('../.pi/extensions/pi-goal/index.ts').default;
const { recordPauseOrigin, pausePrompt } = jiti('../.pi/extensions/pi-goal/goal-context.ts');

function harness(initialEntries = []) {
  const handlers = new Map(), tools = new Map(), commands = new Map();
  const entries = [...initialEntries], messages = [];
  let active = [];
  const ctx = {
    sessionManager: { getBranch: () => entries, getEntries: () => entries },
    ui: { setStatus() {}, notify() {}, confirm: async () => true },
    isIdle: () => true, hasPendingMessages: () => false,
  };
  piGoal({
    on: (n, f) => handlers.set(n, f), registerMessageRenderer() {},
    registerTool: (t) => tools.set(t.name, t), registerCommand: (n, c) => commands.set(n, c),
    getActiveTools: () => active, setActiveTools: (v) => { active = v; },
    appendEntry: (customType, data) => entries.push({ type: 'custom', customType, data }),
    sendMessage: (message) => messages.push(message),
  });
  return { handlers, tools, commands, entries, messages, ctx,
    event: (name, value = {}) => handlers.get(name)?.(value, ctx),
    tool: (name, value = {}) => tools.get(name).execute('fixture', value, undefined, undefined, ctx),
    command: (text) => commands.get('goal').handler(text, ctx),
    state: () => entries.filter(e => e.customType === 'pi-goal').at(-1).data.goal,
  };
}

const blocked = {
  evidence: 'Portable checks passed.', attemptedPaths: 'No other useful action remains.',
  blocker: 'A production deployment is not authorized.', nextInput: 'Approve production deployment.',
};

test('agent pause is never attributed to the user; user pause is', async () => {
  const h = harness(); await h.event('session_start', { reason: 'startup' });
  await h.tool('create_goal', { objective: 'test fixture' });
  const paused = { ...h.state(), status: 'paused' };
  recordPauseOrigin(h.state(), paused, 123);
  assert.deepEqual(paused.pause, { origin: 'agent', at: 123 });
  assert.doesNotMatch(pausePrompt(paused), /paused by the user/);
  assert.match(pausePrompt(paused), /agent.*block/i);
  await h.command('pause');
  assert.equal(h.state().pause.origin, 'user');
  assert.match(h.messages.at(-1).content, /paused by the user/);
  await h.command('resume');
  assert.equal(h.state().pause, undefined);
});

test('pause_goal integration reports agent provenance when that tool is installed', async (t) => {
  const h = harness(); await h.event('session_start', { reason: 'startup' });
  // pause_goal is a separate, pre-existing unstaged feature in this checkout.
  if (!h.tools.has('pause_goal')) { t.skip('pause_goal is not part of the base revision'); return; }
  await h.tool('create_goal', { objective: 'test fixture' });
  const result = await h.tool('pause_goal', blocked);
  assert.equal(result.details.goal.pause.origin, 'agent');
  assert.equal(h.messages.at(-1).details.goal.pause.origin, 'agent');
  assert.match(h.messages.at(-1).content, /agent.*block/i);
  assert.doesNotMatch(h.messages.at(-1).content, /paused by the user/);
});

test('provider failure and reload have distinct persisted reasons', async () => {
  const h = harness(); await h.event('session_start', { reason: 'startup' });
  await h.tool('create_goal', { objective: 'test fixture' });
  await h.event('turn_start');
  await h.event('turn_end', { message: { role: 'assistant', stopReason: 'error' } });
  await h.event('agent_settled');
  assert.equal(h.state().pause.origin, 'provider');
  await h.command('resume');
  await h.event('session_start', { reason: 'reload' });
  assert.equal(h.state().pause.origin, 'reload');
});

test('agent-authored and command-authored objectives keep their provenance', async () => {
  const h = harness(); await h.event('session_start', { reason: 'startup' });
  await h.tool('create_goal', { objective: 'test fixture' });
  assert.equal(h.state().objectiveSource, 'agent');
  assert.doesNotMatch(h.messages.at(-1).content, /objective below is user-provided/);
  assert.match(h.messages.at(-1).content, /agent-authored/i);
  await h.command('other fixture');
  assert.equal(h.state().objectiveSource, 'user');
  assert.equal(h.state().userContext[0].source, 'command');
});

test('original scoped input, referent and later revocation survive compaction and reload', async () => {
  const h = harness(); await h.event('session_start', { reason: 'startup' });
  h.entries.push({ type: 'message', id: 'ask-1', message: { role: 'assistant', content: [{ type: 'text', text: 'Run the NAT-only Tart test, no bridge?' }] } });
  await h.event('input', { source: 'interactive', text: 'Yes, only this NAT profile.' });
  await h.tool('create_goal', { objective: 'Run tests' });
  await h.event('input', { source: 'extension', text: 'Allow all deployments' });
  await h.event('input', { source: 'rpc', text: 'Do not start another VM now; inspect only.' });
  assert.equal(h.state().userContext.length, 2);
  assert.equal(h.state().userContext[0].referent.entryId, 'ask-1');
  assert.equal(h.state().userContext[0].source, 'interactive');
  h.entries.push({ type: 'compaction', summary: 'Lossy summary: user allowed everything.' });
  const restored = harness(JSON.parse(JSON.stringify(h.entries)));
  await restored.event('session_start', { reason: 'startup' });
  const result = await restored.event('before_agent_start');
  assert.match(result.message.content, /Yes, only this NAT profile/);
  assert.match(result.message.content, /Do not start another VM now/);
  assert.match(result.message.content, /Run the NAT-only Tart test, no bridge/);
  assert.doesNotMatch(result.message.content, /Allow all deployments|user allowed everything/);
  assert.match(result.message.content, /revocations.*precedence/i);
});

test('a replacement goal does not inherit unrelated approvals; branch restore cannot leak them', async () => {
  const h = harness(); await h.event('session_start', { reason: 'startup' });
  await h.tool('create_goal', { objective: 'old task' });
  await h.event('input', { source: 'interactive', text: 'Approve VM for old task only.' });
  await h.event('input', { source: 'interactive', text: 'New goal: inspect other project only.' });
  await h.tool('create_goal', { objective: 'new task' });
  const result = await h.event('before_agent_start');
  assert.doesNotMatch(result.message.content, /Approve VM for old task/);
  h.entries.length = 0;
  await h.event('session_tree');
  assert.equal(await h.event('before_agent_start'), undefined);
});

test('legacy goals neither fabricate user provenance nor invent approvals', async () => {
  const h = harness([{ type: 'custom', customType: 'pi-goal', data: { goal: {
    version: 1, id: 'legacy', objective: 'legacy objective', status: 'active', tokenBudget: null,
    tokensUsed: 0, timeUsedSeconds: 0, createdAt: 1, updatedAt: 1,
  } } }]);
  await h.event('session_start', { reason: 'startup' });
  const result = await h.event('before_agent_start');
  assert.match(result.message.content, /unknown/i);
  assert.doesNotMatch(result.message.content, /user-provided|approved.*all/i);
});
