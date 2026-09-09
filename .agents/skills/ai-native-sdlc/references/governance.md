# Governance, autonomy, and measurement

## The audit chain

No separate compliance document is produced. The committed artifacts are the
record, in order:

| Evidence | Answers |
|----------|---------|
| `intent.md` (author, commit timestamp) | Who asked, when, and why |
| `spec.md` | What was agreed, and which constraints applied |
| `plan.md` | What was going to be done, approved before it was done |
| Git diff + `npm test` / `npm run lint` output | What was actually done, and that it works |
| PR review thread | Who approved, and what they checked |
| Stage 6 record | What broke afterwards, and what it produced |

If a step's evidence does not exist, the honest statement is "not verified" —
not a reconstructed narrative.

## Autonomy tiers

Match the response to the confidence, and never skip a tier upward silently.

| Tier | Trigger | Allowed action |
|------|---------|----------------|
| Log | Minor deviation, single occurrence | Record it, take no action |
| Diagnose | Repeated or unexplained | Read-only investigation, write findings |
| Propose | Cause understood, fix is small and reversible | Open a PR through the normal gate |
| Escalate | Ambiguous, risky, or outward-facing | Stop and ask the owner |

Irreversible or outward-facing actions — pushes, PRs, releases, published
artifacts, deletions — are always **Escalate** unless already authorized. An
approval given once does not carry to the next action.

## What is worth measuring here

Leading (fast feedback on the process):
- Time from conversation to a committed `intent.md`.
- First-pass green rate: how often `npm test` + `npm run lint` pass on the
  first attempt after implementation.
- Number of review rounds per PR.

Lagging (whether the process is actually working):
- Intent survival rate — accepted vs. closed. Near 100% means intents are being
  written only after the decision was already made, which defeats Stage 1.
- Rework cycles per change.
- Repeat incidents of the same class — the sharpest signal that a fix treated
  a symptom.

## Deterministic controls (hooks)

The playbook pairs skills (guidance the model follows) with hooks (rules the
harness enforces). This repo has no deployment pipeline, so no gate hook is
installed. If one is added later, it belongs in `.claude/settings.json` — see
the `update-config` skill — and should enforce, at minimum:

- Block writes to `main` without an approved PR.
- Block any command that publishes or deploys unless an explicit approval
  variable is set in the environment.

Guidance in a SKILL.md is a strong default. A hook is the thing that holds when
the model is wrong.
