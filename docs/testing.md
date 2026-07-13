# Testing And Quality Checks

This project uses a small automated quality baseline that can run locally and in CI. The goal is to catch broken decoding helpers, TypeScript issues, frontend build failures, dependency audit problems, and Rust/Tauri compile errors before changes are shared.

## Local Fast Check

Run unit tests while working:

```bash
npm run test
```

Use this after focused changes in parser, profile, filtering, command, or store logic.

## Local Full Check

On Windows, run:

```powershell
npm run quality:check
```

This runs:

- TypeScript unit tests
- production frontend build
- accessibility baseline checks
- browser compatibility baseline checks
- npm dependency audit
- `cargo check` for the Tauri Rust crate

If you only changed web UI and want to skip Rust temporarily:

```powershell
npm run quality:check -- -SkipRust
```

If you are offline and only need compile/test feedback:

```powershell
npm run quality:check -- -SkipAudit
```

## CI Quality Workflow

The `Quality` GitHub Actions workflow runs on pull requests and pushes to `main`.

It checks:

- dependency installation with `npm ci`
- Vitest unit tests
- production build
- accessibility baseline checks
- browser compatibility baseline checks
- Rust `cargo check`

The separate `Security` workflow handles dependency audits and Rust vulnerability checks.

## Performance Benchmarks

Run benchmarks when changing trace parsing, display filtering, sorting, profile decoding, or other paths that touch many frames:

```bash
npm run benchmark
```

The benchmark suite currently covers:

- candump parsing for 10k and 50k frame traces
- canonical profile decoding across different CAN/CAN-FD layouts

Benchmark numbers vary by machine, so treat them as a local comparison tool. Run them before and after a performance-sensitive change and compare the same machine under similar load.

## What To Test When Adding Features

Use this checklist when deciding whether a change needs more tests:

- Parser behavior: add unit tests for accepted and rejected input lines.
- Profile decoding: add tests with a known CAN ID, payload, profile, and expected decoded values.
- Filter or sort behavior: test the expression or ordering helper directly.
- Persistence: test migration/default behavior where practical.
- UI-only changes: run the full build and manually inspect the changed screen.
- Accessibility-sensitive changes: run `npm run accessibility:check`, verify keyboard focus order, and inspect screen-reader names for icon-only controls.
- Tauri/Rust changes: run `cargo check` and add Rust tests when logic moves out of command glue.
- Performance-sensitive changes: run `npm run benchmark` before and after the change.

## Accessibility Baseline

Run:

```powershell
npm run accessibility:check
```

The baseline checks for document language, viewport, document title, accessible icon button fallback, screen-reader-only text, alert roles, interactive hover/help text, and raw button `type` attributes.

This is not a full WCAG audit. It is a repeatable guard for common regressions. For larger UI changes, also test:

- keyboard-only navigation
- visible focus state
- screen-reader names for icon buttons
- readable contrast in each theme
- zoom at 200 percent
- compact and dense layouts

## Browser Compatibility Baseline

Run after a production build:

```powershell
npm run browser:check
```

The baseline checks:

- explicit production browser targets in `package.json`
- responsive viewport metadata
- install/PWA manifest metadata
- no direct user-agent browser sniffing in source files
- generated production module script output
- generated web manifest display mode

Production browser targets are:

- Chrome 120 and newer
- Edge 120 and newer
- Firefox 121 and newer
- Safari 17 and newer

For UI-heavy changes, also do a manual smoke test in Chromium/WebView2, Firefox, and Safari when available:

- open the built app with `npm run preview`
- load a candump file
- use display filters
- open Help
- open Profile Editor
- verify scrolling, sticky headers, dialogs, and theme/density controls

## Current Limits

The automated baseline is intentionally practical. It does not yet include browser-based visual regression, full accessibility scanning, or large-trace performance budgets.
