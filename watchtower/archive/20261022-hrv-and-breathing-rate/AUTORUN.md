# Autorun

Started: 2026-10-22. The user reviews feat/hrv-and-breathing-rate and merges it to main.

## Config

```text
protected_branches: main
branch_prefix: feat/
forbidden_paths: .env* */.env*
format_globs: *.ts *.tsx *.js *.jsx *.mjs *.cjs *.json *.css *.scss
format_exclude: watchtower/*
max_line: 100
header_pattern: ^(feat|fix|docs|refactor|test|chore|style|perf)(\([a-z0-9-]+\))?: .+
max_builders: 6
```

## Repo Rules

- Never deploy to Vercel.
- Never stage the owner's own uncommitted work: the README hunk that links [docs/how-rppg-works.md](docs/how-rppg-works.md), [CLAUDE.md](CLAUDE.md), and [docs/how-rppg-works.md](docs/how-rppg-works.md).

## Environment

- Start: `npm run dev` (Vite on http://localhost:5173). Stop: kill that dev server.
- A headless fake camera shows no face, so a scan never finishes. Result-view checks need a human with a real face.
