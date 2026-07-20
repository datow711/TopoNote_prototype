# Repository Guidelines

## Project Structure & Module Organization

TopoNote is a static HTML/CSS/JavaScript PWA. Browser entry points are `index.html`, `main.js`, and `style.css`; `config.js` contains public endpoint configuration, while `manifest.json`, `sw.js`, and `icon-*.png` provide PWA assets.

Supabase migrations and smoke queries live in `db/` and use date-prefixed names such as `2026-07-08_soft_unlink_audio_records.sql`. Root upload/API Apps Script code is in `gas/`. Spreadsheet-bound synchronization code is under `places-gas/gas/`. Architecture notes are in `docs/`, Playwright specs in `tests/`, and operational history in `logs/` and the current `*_HANDOFF.md` files.

## Build, Test, and Development Commands

- `npm install`: install development dependencies.
- `npm run dev`: serve the app at `http://localhost:5173` with cache disabled.
- `npm run test:ui`: run all Playwright UI tests.
- `npm run test:ui -- tests/place-info.spec.js`: run one spec.
- `node --check main.js`: catch JavaScript syntax errors quickly.
- `git diff --check`: detect whitespace errors before committing.
- From `places-gas/`, use `npx.cmd clasp status` and `npx.cmd clasp push` to inspect or publish Apps Script changes.

There is no bundling step; production uses the checked-in static files directly.

## Coding Style & Naming Conventions

Follow the existing JavaScript style: two-space indentation, semicolons, single quotes, `camelCase` functions/variables, and `UPPER_SNAKE_CASE` constants. Prefer narrow changes over broad UI rewrites and use kebab-case DOM class names. Preserve Traditional Chinese UI wording. Display names are presentation data; login, filtering, assignment, and database writes remain keyed by account/email.

## Testing Guidelines

Tests use `@playwright/test` and are named `tests/<feature>.spec.js`. Add focused regression coverage, mock GAS/Supabase calls where practical, and assert visible results and submitted payloads. No numeric coverage threshold is configured. Database or Sheet-sync changes require a targeted SQL/readback or documented smoke test.

## Commit & Pull Request Guidelines

History favors short imperative subjects, optionally with Conventional Commit prefixes: `Fix admin loading of paged Supabase tasks` or `feat: add admin upload report`. Keep commits cohesive. Pull requests should explain behavior, list validation, link issues when available, and include UI screenshots. Call out migrations, Apps Script deployment steps, and Google Sheet impact.

## Security & Agent Workflow

Never commit service-role keys, webhook secrets, or local `.clasp.json` files. Store backend secrets in Apps Script project properties. Before substantial work, read `LATEST_HANDOFF.md` and relevant `docs/` or recent `logs/sessions/`; verify live Supabase grants/schema and Apps Script deployment state rather than assuming migrations or `clasp push` reflect production.
