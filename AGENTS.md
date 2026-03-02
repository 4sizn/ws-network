# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-27
**Commit:** (unborn)
**Branch:** master

## OVERVIEW
This repo is a local bundle of LLM/agent skills (mostly Markdown + a few scripts). The canonical source lives under `.agents/skills/`; `.agent/skills/`, `.claude/skills/`, and `.cline/skills/` mirror it via symlinks.

## STRUCTURE
```
./
├── .agents/skills/               # canonical skill content
├── .agent/skills/                # symlink mirror -> .agents/skills
├── .claude/skills/               # symlink mirror -> .agents/skills
├── .cline/skills/                # symlink mirror -> .agents/skills
├── .opencode/                    # local OpenCode plugin deps (has node_modules/)
├── opencode.json                 # OpenCode model/provider config
└── skills-lock.json              # pinned skills sources + hashes
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Find available skills | `.agents/skills/` | Each subdir is one skill.
| Learn a skill's trigger + instructions | `.agents/skills/<skill>/SKILL.md` | YAML frontmatter name/description + body.
| React/Next perf guidelines (compiled) | `.agents/skills/vercel-react-best-practices/AGENTS.md` | Large generated doc; use as reference.
| Remotion guidance | `.agents/skills/remotion-best-practices/rules/` | Topic-based rule files.
| Skill authoring/evals tooling | `.agents/skills/skill-creator/` | Python scripts + HTML viewer.
| Change model/provider | `opencode.json` | `model`, `small_model`, enabled providers.
| See pinned upstream sources | `skills-lock.json` | Maps skill -> GitHub repo + computed hash.

## CONVENTIONS
- Canonical edits go in `.agents/skills/` (other tool-specific directories are symlink mirrors).
- Skill layout is `SKILL.md` plus optional `rules/`, `scripts/`, `references/`, `assets/`.
- OpenCode `task` calls must use `run_in_background` (boolean). Do not use `run_background`.
- Default execution mode for independent agent tasks is parallel background: launch multiple `task(...)` calls with `run_in_background: true`.
- Only use `run_in_background: false` when downstream steps require immediate, sequential task output.

## ANTI-PATTERNS (THIS PROJECT)
- Do not edit `.agent/skills/`, `.claude/skills/`, `.cline/skills/` directly; they are symlink mirrors.
- Do not edit `.opencode/node_modules/` (generated vendored deps).

## WS-NETWORK CODE RULES

- TypeScript is strict and enforces `isolatedModules` + `noUnusedLocals` + `noUnusedParameters` (`tsconfig.json`).
- Biome formatting uses 2-space indent, 80 columns, single quotes (`biome.json`).
- Avoid hardcoded URLs and any secrets (tokens, keys) in `src/`; require config injection.
- Preserve the adapter-based design in `src/lib/WebSocketClient.ts` and keep worker entrypoints under `src/lib/workers/`.

## COMMANDS
```bash
# quick inventory
ls -la .agents/skills

# find all skills by name
find .agents/skills -maxdepth 2 -name SKILL.md -print

# inspect pinned sources
cat skills-lock.json
```
