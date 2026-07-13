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
- Rust `cargo check`

The separate `Security` workflow handles dependency audits and Rust vulnerability checks.

## What To Test When Adding Features

Use this checklist when deciding whether a change needs more tests:

- Parser behavior: add unit tests for accepted and rejected input lines.
- Profile decoding: add tests with a known CAN ID, payload, profile, and expected decoded values.
- Filter or sort behavior: test the expression or ordering helper directly.
- Persistence: test migration/default behavior where practical.
- UI-only changes: run the full build and manually inspect the changed screen.
- Tauri/Rust changes: run `cargo check` and add Rust tests when logic moves out of command glue.

## Current Limits

The automated baseline is intentionally practical. It does not yet include browser-based visual regression, accessibility scanning, or large-trace performance budgets. Those are tracked separately in the TODO list.
