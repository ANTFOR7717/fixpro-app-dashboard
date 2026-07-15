# implementation-planning

Spec Kit extension. Routes post-`/speckit-tasks` planning to either the
`whiteboarding` or `subagent-planning` skill via `planning-router`, and
blocks `/speckit-implement` until a human has explicitly approved the
result.

## Hooks

- `after_tasks` (mandatory) → `speckit.plan.route` — invokes
  `planning-router` with `spec.md`/`plan.md`/`tasks.md` as context,
  mechanically resolves and creates exactly one target file
  (`specs/<feature>/whiteboard.md` or `specs/<feature>/subagents.md`),
  and invokes whichever skill the router selected against that file.
- `before_implement` (mandatory) → `speckit.plan.check-approved` —
  refuses to let `/speckit-implement` proceed unless
  `.specify/feature.json` has `plan_approved: true`.

## Not hooked

- `speckit.plan.approve` — run manually (by the agent, once the human
  gives explicit approval in conversation). Writes `plan_approved: true`.
  There is no lifecycle event for "a human approved something in chat,"
  so this cannot be a hook; it has to be an explicit, separate step.

## Dependencies

- The `whiteboarding` and `subagent-planning` skills must be installed
  and both support being handed a plan document to populate (neither
  chooses its own filename/location).
- `scripts/make-diff.sh`, used by `whiteboarding` for its Exact-Change
  Contract diffs, lives in the `whiteboarding` skill package itself,
  not here — this extension never duplicates it.

## Known limitation

Hook execution (`after_tasks`, `before_implement`) is enforced the same
way every Spec Kit core command enforces its own hooks: the invoking
command's instructions tell the agent to run the hook and wait for its
result. There is no separate process-level block — an agent that chose
to ignore the instruction could still proceed. This matches how Spec
Kit's own built-in commands work; it is not a weaker guarantee than the
rest of the system provides.
