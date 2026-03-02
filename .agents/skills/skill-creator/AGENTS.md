# skill-creator Knowledge Base

## OVERVIEW
Tooling + workflow docs for creating/improving skills, running evals, aggregating benchmarks, and generating a reviewer UI.

## STRUCTURE
```
.agents/skills/skill-creator/
├── SKILL.md
├── agents/                 # grader/comparator/analyzer instructions
├── scripts/                # python utilities (eval loop, reporting, packaging)
├── eval-viewer/            # generate_review.py + viewer.html
└── references/             # schemas and supporting docs
```

## WHERE TO LOOK
| Need | Location | Notes |
|------|----------|-------|
| End-to-end workflow | `.agents/skills/skill-creator/SKILL.md` | This is the authoritative process spec.
| Benchmark aggregation | `.agents/skills/skill-creator/scripts/aggregate_benchmark.py` | Consumes per-run `grading.json`.
| Run loop / eval harness | `.agents/skills/skill-creator/scripts/run_loop.py` | Drives iterative trigger/quality loops.
| Generate reviewer UI | `.agents/skills/skill-creator/eval-viewer/generate_review.py` | Produces HTML review experience.
| Output schemas | `.agents/skills/skill-creator/references/` | Viewer expects exact field names.

## COMMANDS
```bash
# aggregate benchmark results for an iteration directory
python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <skill>

# generate a static review HTML (headless-friendly)
python eval-viewer/generate_review.py <workspace>/iteration-N --skill-name "<skill>" --static /tmp/review.html
```

## ANTI-PATTERNS
- Do not hand-roll custom HTML for reviews; use `eval-viewer/generate_review.py`.
- Do not rename JSON fields the viewer depends on (see `references/`).
