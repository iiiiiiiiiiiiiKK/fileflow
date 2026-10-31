# Contributing to FileFlow

Thanks for taking the time to help. FileFlow is deliberately small: a static React app that
parses files in the browser. Keeping it small is a feature, so please read the ground rules
before opening a pull request.

## Ground rules

1. **Local only.** No feature may upload file content, call an external API, or add analytics.
   Conversions must keep working offline, in a single tab.
2. **Never destroy data silently.** If a transformation is lossy, the UI must explain it before
   it happens (see `src/lib/convert.ts` warnings and the cleaning panel).
3. **Types are a contract.** `00123`, long IDs and empty strings must not become numbers or
   `null` by accident. `src/lib/infer.ts` documents the rules — extend the tests, not the rules.
4. **Every data change is undoable** and previewed with an impact count.
5. **No new runtime dependency** without a short justification in the PR (licence, size,
   maintenance). MIT/Apache-2.0/ISC only.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm run test:watch   # unit tests while you work
```

## Before opening a PR

```bash
npm run check                    # lint + typecheck + unit tests + production build
npm run build && npx playwright install chromium && npm run e2e
node scripts/audit-layout.mjs    # needs a preview server: npm run build && npm run preview
```

All four must pass. The repo also enforces `eslint --max-warnings 0`.

## Where things live

| Area | File |
| --- | --- |
| Type inference & cell rules | `src/lib/infer.ts` |
| Parsing (encoding, CSV, JSON, JSONL) | `src/lib/parse.ts` |
| Editing operations (filter, sort, dedupe, replace, dates) | `src/lib/table.ts` |
| Conversion matrix & warnings | `src/lib/convert.ts` |
| Serialisation | `src/lib/serialize.ts` |
| Limits (file size, rows, depth …) | `src/lib/limits.ts` |
| UI copy (zh-CN + en) | `src/i18n/messages.ts` |

## Adding a feature

1. Add the pure logic to `src/lib/*` with unit tests (most bugs live here).
2. Add the UI in `src/components/*`, wired through `useWorkspace` so it participates in undo.
3. Add strings to **both** `zh` and `en` in `src/i18n/messages.ts` — they are type-checked
   against each other, so a missing key fails the build.
4. Add an end-to-end test in `e2e/workbench.spec.ts` and, if it affects layout, a width to
   `e2e/responsive.spec.ts`.
5. Update the README feature table and, if the UI changed, `npm run screenshots`.

## Reporting bugs

Please include: the browser, the file type, what you expected, what happened, and — if the
file is not sensitive — a minimal sample. **Never attach real personal data to an issue.**

## Code style

- TypeScript strict mode, no `any`.
- Pure functions in `src/lib` (no DOM access) so they stay testable and Worker-safe.
- Comments explain *why*, not *what*.
- Keep components small; derive state with `useMemo` instead of duplicating it.

## Commit messages

```
feat: per-column filtering in the table toolbar
fix: keep 16-digit IDs as text when inferring types
docs: document the CSV null-handling caveat
test: cover unsupported binary imports
```

By contributing you agree your work is released under the [MIT licence](LICENSE).
