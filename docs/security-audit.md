# Security Audit Guide

This project handles local profiles, trace files, connection settings, and remote daemon endpoints. Treat all of those as local engineering data that may contain sensitive system or lab details.

## What To Check

- Dependencies: run npm and Rust dependency audits.
- Secrets: check the repository for tokens, private keys, and credentials.
- Connection profiles: avoid committing real host names, internal addresses, or lab-only interface names unless they are intended examples.
- Trace files: avoid committing captures from private systems unless they are sanitized.
- Profile JSON: check whether message names, service names, or error dictionaries reveal protected product information.
- Tauri permissions: keep filesystem and dialog plugins scoped to real app needs.
- Remote daemon exposure: do not expose the daemon to untrusted networks without network-level protection.

## Local Audit

Run:

```powershell
npm run security:audit
```

This runs:

- npm audit for web dependencies
- cargo audit for Tauri dependencies when `cargo-audit` is installed
- a simple secret pattern scan over repository files

For dependency freshness checks, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/security-audit.ps1 -Strict
```

## CI Audit

The GitHub Actions security workflow runs on pull requests and pushes to `main`.

It checks:

- `npm audit --audit-level=moderate`
- unit tests
- production build
- `cargo audit` for `src-tauri`

## Before Sharing Logs Or Profiles

Review exported diagnostics, trace archives, candump logs, settings backups, and profile JSON before sharing. These files can include:

- host names
- interface names
- CAN identifiers
- decoded field names
- error text
- timing information
- profile metadata

## Known Limits

This checklist is not a formal penetration test. It is a repeatable baseline that catches common dependency and accidental-secret issues. For production deployment on shared networks, review daemon exposure, TLS/network controls, endpoint authentication, and operational logging separately.
