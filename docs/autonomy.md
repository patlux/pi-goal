# Goal provenance and scoped authorization

Goals describe the task; they do not grant authority or create new user prohibitions.
A goal set through `create_goal` is marked agent-authored. A `/goal` command is
marked user-authored. Old version-1 state stays readable and has unknown provenance.
No existing session file is rewritten.

Pause state distinguishes `user`, `agent`, `provider`, and `reload`. Only a user
pause emits “paused by the user”. The optional fields preserve the existing state
schema and usage accounting. Resume clears the active pause reason; previous
session entries retain its history. Genuine external blockers still pause, and
reload/provider failures do not silently restart execution.

## Original input instead of inferred grants

While a goal is active or paused, real `interactive` and `rpc` input events retain
original text, source, time and the preceding assistant text/entry ID as a referent.
Direct `/goal` commands are recorded with source `command` because command handlers
do not expose whether their caller used the terminal or RPC.
Extension-injected inputs, tool outputs and compacted summaries are not grants and
are not added to these records. RPC input has the same trust boundary as ordinary
Pi RPC user input; this is not an authentication system.

A `before_agent_start` context message reintroduces these records after compaction
or restart. Continuations include them as well. Later restrictions and revocations
win. A new goal starts with only its triggering input, not the previous goal's
approvals. Tree navigation restores only the selected branch's state.

Records are bounded to the latest 16 inputs and 24,000 serialized characters;
individual input/referent excerpts are limited to 4,000 characters and marked if
truncated. Missing/omitted context is explicit and must never be read as consent.
Do not put secrets into goal input. The context stores excerpts in the same local
session that already holds the original messages, not in an external database.

This is provenance-aware prompt context, **not a permission engine**. No model tool
can insert a grant, no keyword means blanket approval, and no approval is inferred
from the agent's goal or an old summary. Applicable policy, original scope/lifetime,
current instructions and explicit current-turn requirements still govern actions.
Legacy sessions do not gain retroactive grants when this feature loads.

## Verification and activation

Run `npm --prefix /Users/patwoz/dev/Personal/pi/pi-goal test`.
The dedicated lifecycle tests cover pause origins, source attribution, input
retention, revocation, compaction/reload and branch/task isolation. A real model
behavior check is separate from these deterministic tests.

The local plugin is loaded from this checkout. Start a new Pi session or use
`/reload` in an existing session after deployment. Reload intentionally pauses an
active goal; `/goal resume` resumes it. This change does not modify or steer any
other running session.

The legacy checkout's full strict TypeScript check has pre-existing schema/result
and `agent_settled` type errors with its installed `@mariozechner` declarations.
New context/state modules pass strict checking; the full-file diagnostic set is
unchanged. Offline loading against the installed Pi runtime and deterministic
lifecycle tests are checked separately.
