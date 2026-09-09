# Stages in detail

Each stage lists: input, what to do, output, and the exit condition. Do not
advance past an exit condition that has not been met.

---

## Stage 1 — Plan (`intent.md`)

**Input:** a conversation, a complaint, a monitoring alert, a rough idea.

**Do:**
1. Interview the originator until the *problem* is clear — not the solution
   they arrived with. One question at a time.
2. Capture what exists today and why it is not enough.
3. Write `docs/sdlc/<slug>/intent.md` from `templates/intent.md`.
4. Leave the "Proposed solution" section deliberately thin. Stage 2 owns design.

**Output:** `intent.md`, committed.

**Exit:** the owner says the intent is worth pursuing. An intent that is closed
instead of accepted is a success, not a waste — record why in the file and keep it.

---

## Stage 2 — Design (`spec.md`)

**Input:** an accepted `intent.md`.

**Do:**
1. Read the code the change would touch before designing anything. In this repo
   that usually means `src/lib/WebSocketClient.ts` and the relevant
   `src/lib/protocols/<protocol>/`.
2. Restate the requirement as testable acceptance criteria.
3. Apply the repo constraints from `SKILL.md` — they are policy, and a design
   that violates one is rejected here, not at review time.
4. Offer 2–3 approaches with trade-offs and a recommendation. Do not survey
   options you would not pursue.
5. Write `docs/sdlc/<slug>/spec.md` from `templates/spec.md`.

**Output:** `spec.md`, committed.

**Exit:** the owner accepts the scope, the chosen approach, and the
out-of-scope list. Flag policy conflicts *now* — they are cheapest here.

---

## Stage 3 — Build (`plan.md` + code)

**Input:** an accepted `spec.md`.

**Do:**
1. Write `docs/sdlc/<slug>/plan.md` from `templates/plan.md`: bite-sized steps,
   each naming the exact file, the change, and how it is verified.
2. **Get the plan approved before writing code.**
3. Implement step by step. Commit at meaningful checkpoints, not once at the end.
4. When you learn something durable about this codebase — a convention, a trap,
   a thing that was gotten wrong — add one line to the root `AGENTS.md`. That
   file is the institutional memory; keep it around a page.

**Output:** code, tests, updated `AGENTS.md` if warranted.

**Exit:** every plan step is done or explicitly dropped with a reason. Partial
scope is reported, never silently narrowed.

---

## Stage 4 — Test

**Input:** implemented code.

**Do:**
1. `npm test` (vitest) and `npm run lint` (biome). Both must pass.
2. `npm run build` when types or public exports changed — `tsc` runs there.
3. New behavior needs a test. Adapter-level behavior is testable without a
   network: see the `FakeAdapter` pattern in `src/lib/WebSocketClient.test.ts`.
4. Verify against the spec's acceptance criteria one by one, not by vibe.

**Output:** passing commands, quoted in the handoff.

**Exit:** green, with output shown. A skipped check is stated as skipped.

**Rule:** during a fix, the test is fixed evidence. Change the implementation.

---

## Stage 5 — Deploy (PR + review)

**Input:** verified changes on a branch (never commit straight to `main`).

**Do:**
1. Open a PR whose description links `intent.md`, `spec.md`, `plan.md` and
   states what was verified and how.
2. Review incoming PRs against: the spec, the repo constraints in `SKILL.md`,
   and the adapter/protocol isolation boundary.
3. Address review comments in the branch; re-run Stage 4 after each round.

**Output:** merged PR.

**Exit:** a human approved it. Never self-merge on the user's behalf, and never
push or open a PR without being asked.

---

## Stage 6 — Maintain (loop closure)

**Input:** an incident, a flaky test, a regression, a repeated support question.

**Do:**
1. Diagnose read-only first: reproduce, read logs/tests, locate the cause.
2. Classify the response:
   - **Log** — noise or one-off. Record and stop.
   - **Diagnose** — write up the cause; no change yet.
   - **Propose** — small, obvious, low-risk fix → go to Stage 5 directly.
   - **Re-enter** — anything larger → write `intent.md` and go to Stage 1.
3. Record repeat incidents of the same class. A second occurrence means the
   fix addressed a symptom.

**Output:** either a fix PR or a new `intent.md`.

**Exit:** the trigger is resolved or queued as an intent. Nothing dies silently.
