# remotion-best-practices Knowledge Base

## OVERVIEW
Remotion (React video) domain rules. `SKILL.md` is the router; `rules/` is the actual library.

## STRUCTURE
```
.agents/skills/remotion-best-practices/
├── SKILL.md
└── rules/
    ├── animations.md
    ├── compositions.md
    ├── ffmpeg.md
    ├── subtitles.md
    └── ...
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Pick the right rule file fast | `.agents/skills/remotion-best-practices/SKILL.md` | Contains pointers for common domains.
| Captions/subtitles | `.agents/skills/remotion-best-practices/rules/subtitles.md` | Also see import/transcribe rules.
| FFmpeg workflows | `.agents/skills/remotion-best-practices/rules/ffmpeg.md` | Trimming, silence detection, etc.
| Asset loading (img/video/audio/fonts) | `.agents/skills/remotion-best-practices/rules/assets.md` | Cross-links to media-specific rules.
| Sequencing/timing/transitions | `.agents/skills/remotion-best-practices/rules/sequencing.md` | Use with `timing.md` and `transitions.md`.
| Parametrizable comps (Zod) | `.agents/skills/remotion-best-practices/rules/parameters.md` | Schema-driven props.

## CONVENTIONS
- Treat each file in `.agents/skills/remotion-best-practices/rules/` as a topic module; prefer adding a new rule file vs growing `SKILL.md`.

## ANTI-PATTERNS
- Don't bury rule selection logic in long prose; keep `SKILL.md` as a pointer map.
