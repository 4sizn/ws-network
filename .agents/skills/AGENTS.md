# .agents/skills Knowledge Base

## OVERVIEW
Canonical skill directory. Each subdirectory is one installable skill; other tool integrations mirror these via symlinks (`.agent/skills`, `.claude/skills`, `.cline/skills`).

## STRUCTURE
```
.agents/skills/
├── <skill>/
│   ├── SKILL.md           # entrypoint (trigger + instructions)
│   ├── AGENTS.md          # optional compiled/long-form reference
│   ├── rules/             # optional topic/rule docs
│   ├── scripts/           # optional deterministic helpers
│   ├── references/        # optional deep docs
│   └── assets/            # optional templates/static files
└── ...
```

## WHERE TO LOOK
| Need | Location | Notes |
|------|----------|-------|
| List skills | `.agents/skills/` | Dir name = skill name.
| Skill triggers | `.agents/skills/*/SKILL.md` | `description:` is the primary trigger surface.
| Vercel React/Next perf rules | `.agents/skills/vercel-react-best-practices/` | `AGENTS.md` is the expanded guide; `rules/` is per-rule.
| Remotion rules | `.agents/skills/remotion-best-practices/rules/` | One topic per file.
| Skill creation + eval harness | `.agents/skills/skill-creator/` | Scripts + reviewer UI.

## CONVENTIONS
- Keep `SKILL.md` actionable: point to `rules/` / `references/` instead of embedding everything.
- Prefer adding new guidance as a new file under `rules/` / `references/` and linking from `SKILL.md`.

## ANTI-PATTERNS
- Avoid duplicating content across multiple skills; link/reference instead.
- Avoid putting generated artifacts under `rules/` (treat as source docs).
