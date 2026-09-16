# Shared Code Migration Plan — RustyCAN ⇄ FlexMQTT

Status: **draft v2 for review** — no code has moved yet. v1 covered utilities, i18n, theme
values, and a shared *headless* sidebar hook while keeping each app's own UI kit. v2 (this
revision, 2026-08-27) raises the bar: **both apps converge on Tailwind v4, React latest, and
shadcn/ui**, and the Sidebar/Navbar and Help System are fast-tracked as the first two genuinely
shared modules.

## 1. Why this document exists

Both apps are solo-maintained, live in separate local folders, and are pushed to separate
GitHub repos under the same `pennowtech` org. Up to now, anything "shared" (the Signal Deck
theme, for instance) has been ported by hand: read the source file in one project, transcribe
values into the other. That already produced one real bug (a hand-converted oklch→HSL palette)
and doesn't scale to i18n, the sidebar, a help system, and half a dozen utility modules. The goal
is a setup where a shared piece of logic is edited **once** and both apps pick it up, with no
publish step required for day-to-day work — and now, with both apps on the same framework
versions and UI kit, that "shared piece" can be an actual styled component, not just headless
logic sitting behind two different wrappers.

## 2. Goals (v2)

1. Both apps run **Tailwind v4** (CSS-first `@theme`, oklch tokens). FlexMQTT is already there;
   RustyCAN migrates from v3.
2. Both apps run the **latest React** (19). FlexMQTT bumps from 18.3.
3. Both apps run the **latest Zustand** (5). FlexMQTT bumps from 4.5 — superseded from v1, which
   had this as a non-goal (shared stores just targeting the lowest common API). Reversed: both
   apps converge on 5, same as React/Tailwind/shadcn above.
4. Both apps use **shadcn/ui** (Radix primitives + Tailwind) as the component library. FlexMQTT
   drops antd entirely.
5. **Sidebar/Navbar** becomes one real shared component in `sbt-desktop-kit`, not two parallel
   implementations behind a shared hook — fast-tracked.
6. **Help System** becomes one real shared module in `sbt-desktop-kit` — fast-tracked, and confirmed
   with a specific shape: **FlexMQTT's simpler content model is the base**, reused by Rusty CAN
   Studio too — not the other way around. FlexMQTT's current help (`HelpView.tsx`, ~180 lines) is
   a single scrollable page of static topic cards with anchor-jump chips; that page-shape is what
   both apps standardize on, rather than RustyCAN's current multi-panel shell. On top of
   that base, add the two things FlexMQTT's version lacks — **a real table of contents** (see
   Phase C for the concrete design — a chip row alone doesn't hold up once there's more content)
   and **a search feature** — reusing RustyCAN's own `HelpSearchInput`/`HelpSearchResults`
   components for that, since they're already built and don't depend on the rest of Rusty's shell.
   Also add **syntax highlighting** for code/example blocks (RustyCAN's
   `highlightTheme.ts` + `help-markdown.css` highlight.js theming), which neither app's version
   has applied to inline examples today. **Explicitly not carried over: the Monaco-based
   editor/diff tooling** (`HelpEditor.tsx`, `HelpDiff.tsx`, `monacoThemes.ts`) — an authoring
   convenience for editing help content in-app, not something an end user needs, and it's the
   single heaviest dependency (Monaco) in RustyCAN's current system.
7. Everything from v1 still applies once the above lands: shared utilities, i18n, and the palette
   token pipeline — and item 1 above (Tailwind v4 on both apps) actually makes the *theme* work
   simpler than v1 planned (§5, Phase G).

## 3. The honest critical path for "as quick as possible"

Sidebar and Help System were asked for "as quick as possible." The honest answer: they can't be
made genuinely shared *before* FlexMQTT is off antd, because a real shared component has to be
authored once, in one set of markup and Tailwind classes, and antd's component model and
class names aren't compatible with that. Skipping straight to "build the shared Sidebar now"
would just produce a third implementation that still needs redoing once FlexMQTT converges —
exactly the copy-paste problem this whole effort exists to stop.

So the fast lane is: do the minimum foundational work first, narrowly scoped to unblock these
two features specifically (not a full app-wide antd audit), then build both shared modules
immediately after. Concretely, in order:

1. **FlexMQTT: replace antd with shadcn/ui** (Phase A). Confirmed scope: 14 files currently
   import from `antd` (see Phase A table). Tailwind is already v4 — no change needed there.
2. **FlexMQTT: bump React 18 → 19** (Phase A, right after antd is gone — antd v5's React 19
   support was the main friction point, and removing it first makes this bump close to a
   non-event).
3. **RustyCAN: migrate Tailwind v3 → v4** (Phase D). Self-contained, no FlexMQTT
   dependency, but it must land before or alongside Phase B/C — a shared component authored in
   Tailwind v4 `@theme` tokens needs RustyCAN on v4 to render identically, not through a
   compatibility shim.
4. **Build the shared Sidebar/Navbar** (Phase B) and **shared Help System** (Phase C) in
   `sbt-desktop-kit`, consumed identically by both apps.

Steps 1–3 can run in parallel (they touch different apps and don't block each other); step 4
depends on both being done. Realistically this is still a multi-session effort — antd→shadcn
alone touches every screen in FlexMQTT — but it's the shortest real path to the two features
actually being one codebase instead of two.

## 4. Current state → target state

| | RustyCAN | FlexMQTT (`desktop-next`) |
|---|---|---|
| Repo | `c:\Per\rusty-can-studio` → `github.com/pennowtech/rusty-can-studio` | `c:\Per\MQTTX\desktop-next` → `github.com/pennowtech/FlexMQTT` |
| React | 19.1 ✅ target | 18.3 → **19** (Phase A, in progress) |
| Zustand | 5.0 ✅ target | ~~4.5~~ → **5.0.9 ✅ done** (Phase A) |
| Tailwind | ~~v3.4~~ → **v4.3 ✅ done** (Phase D) | v4.3 ✅ target |
| UI kit | shadcn/ui ✅ target | ~~antd~~ → **shadcn/ui ✅ done** (Phase A) |
| Theme system | `ThemeProvider.tsx` — light/dark/system **+ 7 palettes** + density | `themeStore.ts` — light/dark/system, **1 fixed palette** (Signal Deck) |
| i18n | Ad hoc Zustand `i18nStore.ts`, 3 locales (en/de/fr) | `i18next` + `react-i18next`, 2 locales (en/de) |
| Sidebar/nav | `Sidebar.tsx` (shadcn, collapsible, Zustand view-switch) | `NavRail.tsx` (now shadcn-based, fixed rail, react-router-dom) → **shared `sbt-desktop-kit` component** (Phase B) |
| Help system | Full shell: TOC, search, chapters, markdown edit/diff/preview, Monaco theming → **adopts the shared shell** (loses the Monaco editor/diff) | `HelpView.tsx` — one static page, 6 hard-coded cards, no TOC/search → **base for the shared `sbt-desktop-kit` component** (Phase C), gains a real TOC, search, and syntax highlighting |
| Router | none (Zustand `view` + switch) | `react-router-dom` *(not unified — see §7)* |
| Package manager | npm | npm |

## 5. Migration phases

### Phase 0 — scaffold `sbt-desktop-kit`
- New sibling repo, `c:\Per\sbt-desktop-kit\` → `github.com/pennowtech/sbt-desktop-kit`. Minimal
  `package.json` (npm name `@singhbuildstech/sbt-desktop-kit`) + `tsconfig.json` (ES2020+), no
  bundler — Vite compiles the imported TS source like any other file.
- Both apps get a Vite alias to the sibling `src/`, with an explicit fallback and a startup warning
  if neither path resolves:
  ```ts
   const siblingKitSrc = path.resolve(__dirname, '../sbt-desktop-kit/src')
   const nodeModulesKitSrc = path.resolve(__dirname, './node_modules/sbt-desktop-kit/src')
   const sbtDesktopKitPath = fs.existsSync(siblingKitSrc) ? siblingKitSrc : nodeModulesKitSrc

   if (!fs.existsSync(siblingKitSrc) && !fs.existsSync(nodeModulesKitSrc)) {
     console.warn('[sbt-desktop-kit] neither path resolved — see vite.config.ts for the fix')
   }

   resolve: {
     alias: {
       '@sbt/desktop-kit': sbtDesktopKitPath
     }
   }
  ```
  Editing a file in `sbt-desktop-kit/src` hot-reloads both dev servers immediately — no build,
  version bump, or publish step. Push to GitHub once stable enough to pin a ref for CI/fresh
  clones. The fallback and the warning both key off the **unscoped** name `sbt-desktop-kit` —
  when adding it as a git dependency, use that same unscoped string as the `package.json` key
  (not the npm-scoped `@singhbuildstech/sbt-desktop-kit` name), e.g.
  `"sbt-desktop-kit": "github:pennowtech/sbt-desktop-kit#v0.3.0"`, so npm installs it at
  `node_modules/sbt-desktop-kit` where the fallback path actually looks. Without either the
  sibling checkout or that dependency, the console warning fires at dev-server startup and any
  `@sbt/desktop-kit` import fails to resolve — a hard build error, not a silent gap.

### Phase A — FlexMQTT: antd → shadcn/ui, then React 19 *(fast lane, prerequisite)* — done

**Status: done (2026-08-28).** antd fully removed (confirmed — zero `antd`/`@ant-design` imports
left in `src`), Zustand at 5.0.9, React/react-dom at ^19.2.0, `react-router-dom` at ^6.27.0
(confirmed React-19-compatible as-is — no major bump needed). `tsc --noEmit` clean. Phases B and C
are unblocked.

This was the largest single phase in the plan. Antd usage found in FlexMQTT at the start:

| File area | antd surface used | shadcn/ui replacement |
|---|---|---|
| `NavRail.tsx` | `Modal` (About dialog) | `Dialog` |
| `HelpView.tsx` | `Typography` (`Title`, `Text`) | plain headings + `text-muted-foreground` |
| *(12 more files — connection forms, message table, settings, composer, etc.)* | `Form`, `Table`, `Select`, `Button`, `message`/`notification`, `Input`, `Tabs`, `Checkbox`, `Tooltip`, `Popconfirm` (typical antd surface for this kind of app) | `Form` primitives + `react-hook-form` pattern (matching RustyCAN's), `TableVirtuoso` or plain table, `Select`, `Button`, `sonner` toasts, `Input`, `Tabs`, `Checkbox`, `Tooltip`, `AlertDialog` |

Recommended approach: **file-by-file, screen-by-screen**, not a big-bang rewrite — antd and
shadcn can coexist in the same app during the transition (they don't conflict at the CSS level
once FlexMQTT's `@theme` tokens are the source of truth for both). Land it as a sequence of
small, individually-testable PRs rather than one giant diff. Order suggested: `NavRail.tsx` and
`HelpView.tsx` first (since Phases B/C need them antd-free anyway), then settings/forms, then the
message table (the biggest single component at 577 lines), then whatever's left.

Once antd is fully removed: bump `react`/`react-dom` to `^19`, `zustand` to `^5` (both now stated
goals, §2 — not just a nice-to-have), and `react-router-dom` to its React-19-compatible major.

**Already done, ahead of the rest of this phase**: button font (now matches RustyCAN's
plain system-UI stack instead of Manrope, scoped to `.ant-btn` only) and the icon swap from
`@ant-design/icons` to `lucide-react` across all 5 files that used it, picking names that match
RustyCAN's own conventions where the concept overlaps (`Trash2`, `HelpCircle`, `FileDown`/
`FolderOpen`, `ListFilter`/`Highlighter`). `@ant-design/icons` has been uninstalled.

### Phase B — shared Sidebar/Navbar *(fast lane)* — done (2026-08-29)

**Status: done.** Verified clean (`tsc` + `vite build`) on both apps. What actually shipped, in
the order it was discovered:

1. **`sbt-desktop-kit/src/nav/AppNavRail.tsx`** — the shared collapsible, grouped nav rail.
   `items: { id, icon, label, group? }[]`, `activeId`, `onSelect`, `logo: { src, onClick, title,
   label? }`. Collapse state lives in `sbt-desktop-kit/src/nav/navRailStore.ts` (Zustand +
   `persist`), not local component state — anything else in an app that needs to trigger the same
   toggle (RustyCAN's "Toggle Sidebar" menu item) imports that store directly, so both
   stay in sync. **RustyCAN's flagged bug, found and confirmed**: `appShellStore.ts`'s
   `sidebarMode` had no persistence at all — plain in-memory Zustand state, always reset to
   collapsed on reload. Not carried into the shared component; fixed by the store above.
2. **Layout iterated significantly past the original spec** based on live feedback: no top/bottom
   pinning (a short item list pinned to either edge of a tall rail left an awkward dead gap) — all
   items including the logo are one vertically-centered group. The collapse toggle isn't a nav-rail
   list item (felt out of place wherever it sat); it's a small chevron that only reveals on
   hovering the rail's own right edge (always visible while collapsed, for discoverability). Every
   collapse/expand transition uses real CSS transitions on actual animatable properties — no
   `justify-content` toggling (not animatable, was the root cause of a visible jump that took
   several iterations to isolate).
3. **`sbt-desktop-kit/src/nav/AppAboutDialog.tsx`** — the shared About modal, triggered by the
   nav rail's logo. Originally hand-rolled (`createPortal` + plain CSS) specifically because a
   real shadcn/Radix Dialog risked duplicate-React-copy issues (see item 5) — migrated to a real
   shadcn Dialog once that was fixed. Radix now owns Escape/outside-click/focus-trap natively.
   RustyCAN's logo click now opens this instead of a full-page `AboutView` (deleted, along
   with the `"about"` view — all three of its old entry points — command palette, TopMenuBar,
   Sidebar — now open the dialog via a shared `aboutOpen` flag in `appShellStore.ts`).
4. **Real, confirmed bug: cross-repo dependency duplication.** The kit and each consuming app
   resolved `react`/`lucide-react` from separate `node_modules` (confirmed via direct version
   check: kit had React 19.2.8, Rusty had 19.2.3) — broke TypeScript's structural typing for
   `lucide-react`'s `LucideIcon` type, and would have risked real runtime breakage for anything
   using React Context internally (Radix primitives). **Fixed with an optional, local-only npm
   workspace** (root `package.json` one level above all three sibling repos, not tracked by any of
   them) — full reasoning and setup steps in `sbt-desktop-kit`'s README, decision recorded in §7
   item 9. Confirmed working: `react` now resolves to one shared copy across all three;
   `lucide-react` correctly stays split where genuinely incompatible (kit + FlexMQTT share one
   hoisted 1.35.0, Rusty keeps its own 0.562.0).
5. **shadcn/ui toolchain added to the kit** now that (4) makes it safe: `cn()` utility,
   `components/ui/dialog.tsx` (canonical, matches RustyCAN's own byte-for-byte), real
   `@radix-ui/react-dialog`/`clsx`/`tailwind-merge` dependencies (versions matched to Rusty CAN
   Studio's for clean hoisting). `AppAboutDialog` uses the lower-level Dialog primitives (not the
   `DialogContent` convenience wrapper) so its overlay can stay transparent — an established
   preference from earlier feedback, not shadcn's dimmed-backdrop default.
6. **Real, confirmed bug: Tailwind v4 content detection.** Tailwind v4's automatic scanning
   doesn't reach files outside a project's own root that are only referenced via a Vite alias —
   the kit's `.tsx` files (aliased from a sibling repo) were never scanned, so none of
   `AppAboutDialog`/`dialog.tsx`'s Tailwind classes were ever generated. Symptom: the dialog
   rendered with no `max-width` at all — bigger than the app window. Fixed with an explicit
   `@source` directive in each app's entry CSS pointing at the kit's `src/` (mind the path depth —
   the CSS file lives one level deeper than `vite.config.ts`, an easy off-by-one). This is a
   **foundational fix**, not specific to the About dialog — it unblocks any future kit component
   built with Tailwind utility classes rather than hand-written CSS.
7. **Token-bridge nuance worth remembering**: FlexMQTT's own `--accent` already means "vivid
   button color" throughout its existing UI — bridging shadcn's `accent`/`accent-foreground`
   convention onto it needed care. Fixed by using FlexMQTT's own purpose-built `--accent-text-on`
   token ("readable text on solid accent fill") for `accent-foreground`, rather than redefining
   what `accent` itself means. General lesson for future token bridges: check whether the target
   app already has an app-specific meaning for a standard shadcn slot name before overwriting it.
8. **FlexMQTT gained**: `tw-animate-css` (needed for the Dialog's open/close animation, didn't
   have it before), a `background`/`foreground`/`muted-foreground`/`ring`/`accent-foreground`
   token bridge in its `@theme` block, and icon grouping (`Workspace`/`System`, matching Rusty CAN
   Studio's own grouping) it didn't have before either.
9. **Editor tasks** added for the optional workspace install in all three repos, matching each
   repo's actual task runner (`.zed/tasks.json` for RustyCAN, `.vscode/tasks.json` for
   FlexMQTT and the kit) — additive only, existing per-app tasks untouched. RustyCAN also
   gained its own `.vscode/tasks.json` (previously Zed-only), covering the same npm scripts its
   README documents.

### Phase C — shared Help System *(fast lane)*
**Base is FlexMQTT's**, not RustyCAN's — confirmed direction, opposite of this phase's
first draft. FlexMQTT's `HelpView.tsx` (~180 lines: one scrollable page, topic cards, anchor-jump
chip row) becomes `sbt-desktop-kit/src/help/HelpPage.tsx`, the shared implementation both apps use.
Reasons this is the right base to build on rather than RustyCAN's current shell: it's
simpler (one page, no panel/routing state to keep in sync), and its content-as-cards model maps
directly onto both apps' actual help content once that content is expressed as markdown chapters
instead of hand-written JSX.

On top of that base, add exactly three things — the ones FlexMQTT's version is missing — and
drop one thing RustyCAN's current version has:

1. **A real table of contents**, replacing the chip row once there's more than a handful of
   topics. Concrete design: a slim sticky sidebar (left, matching the app shell's own sidebar
   convention) listing chapters and their headings, the active section highlighted via
   `IntersectionObserver` as the reader scrolls — not just a jump-on-click chip row, which stops
   being useful once a chapter has sub-headings worth navigating to directly. Collapsible on
   narrow viewports (a "Contents" disclosure button), matching the responsive pattern Rusty CAN
   Studio's `HelpTOC.tsx` already established. This *is* effectively a full port of
   `HelpTOC.tsx`'s behavior, layered onto FlexMQTT's simpler page rather than Rusty's shell.
2. **Search** — reuse RustyCAN's `HelpSearchInput.tsx` + `HelpSearchResults.tsx` as-is;
   they're self-contained (search box + result list + jump-to-match) and don't depend on the rest
   of RustyCAN's shell, so they drop into the FlexMQTT-shaped page cleanly.
3. **Syntax highlighting** for code/example blocks — reuse RustyCAN's
   `highlightTheme.ts` + the relevant slice of `help-markdown.css`. Neither app currently
   highlights inline examples (FlexMQTT's filter-DSL examples in its own Filtering card, Rusty CAN
   Studio's CAN-ID/payload examples) — both benefit.
4. **Not carried over: the Monaco-based editor/diff** (`HelpEditor.tsx`, `HelpDiff.tsx`,
   `monacoThemes.ts`). Explicitly out of scope for the shared module — it's an authoring
   convenience for editing help content from inside the app, not something an end user needs, and
   it's the single heaviest dependency in RustyCAN's current help system. Help content for
   both apps is authored as plain markdown files in each app's own repo instead.

Content stays app-specific either way: FlexMQTT's six existing topics (Getting Started,
Connections, Navigation, Workspace, Filtering, Settings) and RustyCAN's existing
`defaultHelpMarkdown.ts` chapters both become markdown files imported into the shared page/TOC/
search shell, not data living inside `sbt-desktop-kit` itself. Styling comes from the same Tailwind v4
tokens both apps share once Phase D lands — no separate theming layer needed.

### Phase D — RustyCAN: Tailwind v3 → v4 — done (2026-08-28)
Prerequisite for Phases B/C rendering identically on both sides, and it also simplifies Phase G
(theme tokens) from "two codegen targets" down to "one."

**What actually shipped**: `tailwindcss-animate` had no v4 support (peerDependencies pinned to
`>=3.0.0` only) and was genuinely load-bearing — 7 UI components' real open/close transitions, not
decoration — so it was replaced with `tw-animate-css` (the standard drop-in for this exact
migration across the shadcn/ui ecosystem; same class names, CSS-only). `@tailwindcss/typography`
needed no replacement — it already declares `tailwindcss: '>=3.0.0 || >=4.0.0'`. Followed
FlexMQTT's own pattern of using `@tailwindcss/vite` directly rather than the PostCSS plugin route —
`tailwind.config.cjs` and `postcss.config.cjs` are both gone; `autoprefixer`/`postcss` uninstalled
(v4's Lightning CSS engine handles prefixing natively). All 278 HSL triples across the 9 palette
blocks converted to oklch via a small verified conversion script (cross-checked against Signal
Deck's known oklch source values before running it on the real file — see the scratch script,
not committed to the repo). `dark:` utility classes (used in ~20 places) needed one explicit line
FlexMQTT never had to write, since FlexMQTT doesn't use Tailwind's `dark:` variant at all:
`@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` — same selector v3's
`darkMode: ["selector", ...]` used to produce, just declared in CSS now. Verified via a full
production build (palette selectors, the custom-variant compound selector, and real utility output
all present and correct), the dev-server pathway specifically (given history — the Signal Deck
bug only showed up in compiled output, not in source), `tsc --noEmit`, and the existing test suite
— all clean.

- Replace `tailwind.config.cjs` + `@tailwind base/components/utilities` with the v4 CSS-first
  `@import "tailwindcss"` + `@theme` block in `index.css`.
- Convert the 7-palette HSL-triple system (`--background: 0 0% 100%` style) to oklch, matching
  FlexMQTT's token format — this is exactly the palette data Phase G needs anyway, so do the
  conversion once, here, and feed it into the shared palette source rather than converting twice.
- Re-verify `tailwindcss-animate` and `@tailwindcss/typography` have v4-compatible releases (or
  their v4 CSS-plugin equivalents) before starting — flag if either doesn't, since that changes
  scope.
- **Pull forward from Phase G**: add the `--json-key`/`--json-string`/`--json-number`/`--json-bool`/
  `--json-punct`/`--diff-changed`/`--diff-added` tokens here, not later. FlexMQTT already has
  these (Signal Deck defines them), so it's copying existing values, not new design work — but
  Phase C's syntax highlighting needs them on **both** apps to render correctly, and Phase C ships
  before Phase G in the fast lane. Leaving this in Phase G would mean the shared Help System's
  code highlighting ships unthemed on RustyCAN until Phase G eventually lands.
- **Watch for the same class of bug found during the Signal Deck work**: verify custom `@layer
  base` rules aren't silently dropped under v4 the way they were under v3.4.19's
  `darkMode: ["selector", ...]` — re-run the isolated-repro technique from that investigation if
  anything looks like it's compiling away silently.

### Phase E — pure utilities (from v1, unchanged)
Move from FlexMQTT into `sbt-desktop-kit/src/utils/`, generalizing names/domain-specific bits:

| Source (FlexMQTT) | Target | Notes |
|---|---|---|
| `utils/jsonDiff.ts` | `utils/jsonDiff.ts` | Copy as-is; no MQTT coupling. |
| `utils/payloadFormat.ts` | `utils/byteTextCodec.ts` | Renamed for domain-neutrality; hex/base64/text/JSON codec logic untouched. |
| `utils/filterExpression.ts` | `utils/filterExpression.ts` | Tokenizer/parser/AST stay; the one MQTT-specific bit (`resolveField`) becomes a resolver callback each app supplies. |
| `utils/messageLog.ts` | `utils/recordExport.ts` | Generalize "message" → generic `T` record; keep JSON/TSV export + filename sanitization. |

**Decided (§7 item 5)**: RustyCAN's own display-filter parser (`parseFilter`/
`rowMatchesFilter` in `CanFdDashboard.tsx`) is replaced by the shared `filterExpression` engine —
it's the more capable, more maintainable of the two (see §7 for the full comparison).

**Status: done (2026-08-28).** Both the 4-file move and the RustyCAN filter-engine swap
are complete, tested (`tsc`/`vite build`/`vitest` all clean on both apps), and this is now also
the prerequisite Phase E.1 (shared alerts) needed. What actually shipped, beyond the plan:

- **`~=` gap resolved by adding regex support to the shared engine**, alongside the existing `~`
  substring op (not dropped from RustyCAN). Required tokenizer changes that benefit both
  apps: unquoted literals can now contain letters after a leading digit (`canId == 18203C01`) and
  field names can contain `:`/`-` (`canId:VehicleSpeed`, `mode == CAN-FD`) — previously only
  quoted strings, plain numbers, and `true`/`false` parsed as literals. A new
  `findInvalidRegexClause(node)` export lets a caller surface a bad `~=` pattern as a parse-time
  error, matching the UI contract RustyCAN's filter bar already had (red border + message,
  not a silent no-match).
- **`canFilterResolver` (`CanFdDashboard.tsx`) resolves each field to whichever form — string or
  number — actually round-trips.** The naive version (prefer the numeric value whenever one
  exists) looked right but broke `service_identifier == k2_focus_control`: every decoded field
  carries both a display string *and* a numeric "physical" code, so it silently returned the code
  instead of the label. Fixed by only preferring the number when `Number(displayString) ===
  physicalCode` — true for plain-numeric fields (len, line, time), false for enum labels and
  unit-suffixed measurements ("50 km/h"), which fall through to their string form. Caught by the
  rewritten `fieldFilter.test.ts`, which now runs the real shared engine against CAN-shaped rows
  instead of a stale local copy of the old regex-based logic.
- **`normalizeCanIdLiterals` fixes `canId == 0x18203C01`** (documented in RustyCAN's help
  content): JS auto-parses an unquoted `0x`-prefixed literal as a decimal number, which wouldn't
  match canId's resolved hex-string form. A small CAN-specific AST rewrite (not a shared-engine
  change) converts a numeric literal back to hex string form for `==`/`!=` on `canId`/`id`
  specifically.
- **One disclosed, deliberate regression**: numeric ordering (`>`, `<`, `>=`, `<=`) on `canId`
  isn't supported post-migration (previously compared the decimal form regardless of what was
  typed). Undocumented anywhere as a use case and superseded by hex-string equality being correct,
  which is the documented, common case. Same trade-off for unit-suffixed decoded measurements
  ("50 km/h" doesn't parse as a number for ordering) — accepted for the same reason: no existing
  documented example relies on it, and fixing it would need decode-metadata (is this field an
  enum or a measurement?) the filter layer doesn't currently have.
- **`defaultOperatorForColumn`'s "add filter from column" UI action** generated the literal word
  `contains` as an operator — never a real token in the shared grammar (the equivalent op is `~`).
  Fixed, along with the same stale wording in the in-app filter tooltip and both places in
  `defaultHelpMarkdown.ts` that documented `contains`.

### Phase E.1 — alerts & notifications (new, decided 2026-08-28)
Both apps independently built rule-based alerting; compared directly, FlexMQTT's is the more
capable of the two and becomes the shared base — same reasoning as the filter-DSL decision (§7
item 5), since FlexMQTT's alerting already evaluates rules through the shared `filterExpression`
engine:

| | RustyCAN (`CanFdDashboard.tsx`) | FlexMQTT (`alertRulesStore.ts` + `useGlobalConnectionListeners.tsx`) |
|---|---|---|
| Rule shape | `{ id, name, expression, enabled }`, flat list, capped at 5, `localStorage` | `{ id, expression, enabled }`, keyed per-connection, Zustand |
| Expression engine | old `parseFilter`/`rowMatchesFilter` (the one Phase E is already replacing) | shared `filterExpression` engine |
| Spam protection | none — a rule matching every row in a burst fires once per row | 4s cooldown per rule (`connectionId:ruleId` key) |
| In-app surface | `toast.warning()`, static description | `toast()` with click-to-jump-to-message and a dismiss action |
| Desktop (OS) notification | none | yes, via Tauri's notification plugin, click-through navigates to the message |

Move into `sbt-desktop-kit/src/alerts/`, generalized the same way `filterExpression` was
generalized (§ Phase E table) — the record type, cooldown map, and toast/notification firing
become generic over `T`, with each app supplying its own `FieldResolver<T>` (already exists for
both, see Phase E) and a `describeMatch(record: T)` callback for the toast/notification body
(CAN ID + payload bytes for Rusty, topic for FlexMQTT).

**Sequencing (decided 2026-08-28): after Phase C, not in parallel with B/C.** Not a technical
dependency — a deliberate choice to finish one shared-UI effort before starting the next rather
than splitting attention across three.

**Prerequisites:**
1. ~~RustyCAN's filter-engine migration~~ **Done (2026-08-28) — see Phase E.** Alert-rule
   evaluation in `CanFdDashboard.tsx` already runs through `parseDisplayFilter`/`rowMatchesFilter`,
   the same shared-engine-backed functions the display filter uses — both features are on one
   engine now.
2. RustyCAN gains the Tauri notification plugin (`@tauri-apps/plugin-notification` +
   the matching Rust crate/capability in `src-tauri`) — net-new dependency, currently only
   FlexMQTT has this wired up. Needs its own permission-prompt UX, matching FlexMQTT's
   `requestDesktopNotificationPermission()` pattern.
3. RustyCAN's 5-rule cap: drop it (matches FlexMQTT, which has none) or keep it as an
   app-specific UI constraint layered on top of the shared module — not yet decided, flag if it
   matters.

### Phase F — headless hooks + presentational components (from v1, unchanged)
- `useResizablePanel` + `ResizeHandle`: move as-is — framework-agnostic, no UI-kit coupling.
- `JsonView`: move the recursive rendering logic; theme via the `--json-*`/`--diff-*` tokens
  both apps will share once Phase D/G land.
- `JsonEditor`'s transparent-textarea-over-highlighted-backdrop technique: tokenizer + scroll-sync
  hook move as shared logic; each app supplies its own `Textarea` (now the *same* shadcn
  component on both sides, post-Phase A).

### Phase G — theme/token unification (simplified by v2's goals)
v1 needed two codegen adapters (HSL for RustyCAN, oklch for FlexMQTT) because the two
apps were on different Tailwind majors. Post-Phase D, both are on Tailwind v4 with oklch tokens,
so this collapses to **one shared token source, no adapter needed** — both apps' `@theme` blocks
are generated (or just directly shared) from the same file.

1. One canonical palette definition in `sbt-desktop-kit/src/theme/`, oklch, covering all 7 palettes
   (`default`, `graphite`, `zeiss-blue`, `high-contrast`, `terminal`, `warm-neutral`,
   `signal-deck`).
2. FlexMQTT gains the palette-picker mechanism it currently lacks (only light/dark today) —
   `palette` state, `data-palette`/class toggling, and a settings `Select` (now shadcn's, not
   antd's) — adapted from RustyCAN's `ThemeProvider.tsx` pattern into FlexMQTT's Zustand
   `themeStore.ts`.

(The `--json-*`/`--diff-*` tokens moved to Phase D — Phase C needs them earlier than this phase
runs.)

### Phase H — i18n unification (from v1, unchanged)
Retire RustyCAN's ad hoc `i18nStore.ts` for `i18next` + `react-i18next`, matching
FlexMQTT. The custom store's real gaps: no pluralization, no interpolation beyond hand-built
templates, no lazy namespace loading, and no resource format another project can consume.

1. `createAppI18n(resources, options)` factory in `sbt-desktop-kit`, wrapping the
   `i18next.use(initReactI18next).init(...)` boilerplate plus the `localStorage` detect/persist
   logic FlexMQTT already has.
2. A shared `common` namespace for generic chrome strings (`common.save`, `settings.language`,
   …) — nearly all of RustyCAN's existing keys already are this kind of string.
   App-specific terms stay in each app's own namespace.
3. Locale coverage gap: FlexMQTT ships en/de; RustyCAN ships en/de/fr. Open question, §7.
4. Call sites swap `useI18nStore((s) => s.t)` for `useTranslation()` — mechanical, `t("key")`
   shape is unchanged.

## 6. Sequencing recommendation

```
Phase 0 ✅ ──┬── Phase A ✅ (FlexMQTT: antd → shadcn, React 19 — done)  ──┐
             └── Phase D ✅ (RustyCAN: Tailwind v3 → v4 — done)   ├──▶ Phase B ✅ (shared Sidebar — done)
Phase E ✅ (utilities + filter-engine migration — done)                              │
                                                                                       ▼
                                                                    Phase C (shared Help System) ◀── starting now
                                                                                       │
                                                                                       ▼
                                                                    Phase E.1 (shared alerts) — deliberately
                                                                    sequenced after C, not run in parallel
                                                                                       then: Phase G (theme, now simpler)
                                                                                       then: Phase F, H (hooks, i18n)
```

**Status (2026-08-29)**: Phase 0, A, D, E, and B are all fully done. **Starting Phase C now.**
**Decided: Phase E.1 (shared alerts/notifications) is deliberately sequenced after Phase C**, not
run in parallel with B/C as earlier sequencing notes suggested — one shared-UI effort (Sidebar →
Help System) at a time, alerts after both land. Phase B also produced two reusable, foundational
fixes that benefit every phase after it: the npm workspace (real shadcn/Radix components are now
safe to build in the kit) and the Tailwind `@source` fix (any future kit component using Tailwind
utility classes, not just hand-written CSS, will actually get its classes generated) — both
documented in Phase B's writeup above.

Phase 0 first (30 minutes, unblocks everything). Phases A and D ran in parallel — different
repos, no shared dependency between them; both now done. Phase E ran independently and is also
done. Phases B and C depend on A+D being done (now true) — note Phase D carries the
`--json-*`/`--diff-*` token addition specifically so Phase C's syntax highlighting isn't left
unthemed on RustyCAN while waiting for the full Phase G palette work. The rest of Phase G
(porting the other 6 palettes to FlexMQTT + its picker UI) doesn't block B or C — both already
render correctly under each app's current single accent (Signal Deck, shared by both already) —
so it can trail behind without holding up the fast lane. Phase E.1, F, and H have no hard
technical dependency on B/C, but E.1 is sequenced after C by choice (see above), and F still
benefits from landing after the fast lane so the eventual shared `JsonView`/`Textarea` work only
has to target one UI kit, not two.

## 7. Decisions (all resolved 2026-08-27)

1. ~~**Repo name**~~ **Decided: `sbt-desktop-kit`** (npm package `@singhbuildstech/sbt-desktop-kit`).

2. ~~**Antd removal strategy**~~ **Decided: file-by-file/incremental**, as recommended in §5
   Phase A. Antd and shadcn coexist in FlexMQTT during the transition; land it as a sequence of
   small, individually-testable PRs, `NavRail.tsx`/`HelpView.tsx` first since Phases B/C need them
   antd-free anyway, then forms/settings, then the message table (577 lines, the largest single
   component), then whatever's left. A big-bang rewrite was the faster-but-riskier alternative —
   rejected given this is solo-maintained with no safety net of a second reviewer.

3. ~~**Sidebar shape**~~ **Decided: RustyCAN's collapsible + grouped-sections behavior
   becomes the shared model for both apps** — not a "fixed rail vs. collapsible" toggle. FlexMQTT
   gains grouping and collapse/expand it doesn't have today. One flag before porting: FlexMQTT's
   current rail was described as working flawlessly, RustyCAN's as "has problems" — the
   behavior being ported over is the right one to standardize on, but whatever's currently wrong
   in `Sidebar.tsx` needs to be fixed *before or during* the port, not carried into
   `sbt-desktop-kit` as-is. **This needs specifics** — next time you hit the problem, note what
   it actually does (wrong collapse state on load? group headers behaving oddly? something else?)
   so Phase B fixes it rather than reproducing it in `sbt-desktop-kit` as-is.

4. ~~**Help System editor**~~ **Decided: no.** Neither app gets in-app editor/diff tooling in the
   shared module; both author help content as plain markdown files in their own repo. Rusty CAN
   Studio loses that capability when it moves onto the shared shell — flag if that's actually
   still wanted somewhere, just not in `sbt-desktop-kit`.

5. ~~**Filter DSL**~~ **Decided: FlexMQTT's `filterExpression` engine becomes the shared one;
   RustyCAN migrates its display filter onto it.** Compared directly (not by line count):
   RustyCAN's `parseFilter` is a single dense regex with a lookahead — compact, but it has
   no parentheses, no `not`, and its `and`/`or` combine strictly left-to-right rather than correct
   precedence (`a and b or c` doesn't mean what a reader would expect). Extending it later would
   mean rewriting the regex, not adding a case. FlexMQTT's is a real tokenizer → recursive-descent
   parser → AST → evaluator — more lines, but each stage is small and independently
   understandable, with correct precedence, parentheses, negation, and dotted/deep-key JSON field
   resolution already built and hardened. It's a strict superset of what RustyCAN's does.
   **Capability gap — resolved (2026-08-28):** RustyCAN's `~=` is a *regex* match;
   FlexMQTT's `~` is a plain substring match. The shared engine gained `~=` alongside `~` (not
   dropped from RustyCAN) — see Phase E for the full list of what else the port surfaced
   and how it was handled (tokenizer changes, the resolver's string-vs-number fix, the `0x`-canId
   literal fix, one disclosed regression on canId numeric ordering).

6. ~~**Locale parity**~~ **Decided:** share the mechanism and a `common` namespace guaranteed in
   **en/de on both apps** (the overlap that already exists everywhere). RustyCAN's `fr`
   stays as an app-specific extra, not deleted, but isn't part of the shared guarantee — FlexMQTT
   isn't obligated to translate anything to ship it, and RustyCAN isn't obligated to drop
   it. Reasoning: the stated goal is a codebase that's easier to manage and less complex to
   reason about — a shared baseline both apps definitely support, plus an optional per-app extra,
   is simpler to reason about than either forcing a third language into FlexMQTT right now or
   deleting a locale RustyCAN users already have.

7. ~~**When to push to GitHub**~~ **Decided: once the end goal is achieved** — meaning once the
   fast lane (Phases 0, A, B, C, D) is done and proven out locally via the sibling-folder alias,
   not before. Development happens entirely against the local path alias until then; the GitHub
   remote is added when there's a stable, working `sbt-desktop-kit` worth pinning a ref to, not
   as a safety net during active back-and-forth changes.

8. ~~**Alerts/notifications base**~~ **Decided (2026-08-28): FlexMQTT's implementation becomes
   the shared base** (Phase E.1) — same reasoning as item 5: it already runs on the shared
   `filterExpression` engine, adds per-rule cooldown RustyCAN's version lacks entirely,
   and fires real OS desktop notifications in addition to the in-app toast. RustyCAN
   adopts it once its own filter-engine migration (item 5) is done — see Phase E.1 for the
   comparison table and prerequisites, including the new Tauri notification-plugin dependency
   this brings to RustyCAN for the first time.

9. ~~**Nx/Turborepo/pnpm-workspaces**~~ **Partially reversed (2026-08-28).** §8's non-goal below
   assumed the sibling-repo + Vite-alias approach alone would be enough — it wasn't, once Phase B
   needed a real shared UI primitive (`AppAboutDialog`) and hit a concrete, confirmed bug: the kit
   and each consuming app resolve `react`/`lucide-react`/etc. from separate `node_modules`
   (confirmed via direct version check — kit had react 19.2.8, Rusty had 19.2.3), which broke
   TypeScript's structural typing for `lucide-react`'s `LucideIcon` type and would have risked
   real runtime breakage for anything using React Context internally (Radix/shadcn primitives,
   specifically). **Decided: an optional, local-only npm workspace**, root `package.json` one
   level above all three sibling repos (not tracked by any of them), hoisting shared dependencies
   into one deduped `node_modules`. Confirmed working: after a clean reinstall, `react` resolves
   to one shared 19.2.8 copy across all three; `lucide-react` correctly stays split (kit and
   FlexMQTT share one hoisted 1.35.0 copy, Rusty keeps its own incompatible 0.562.0 — npm hoists
   only what's actually semver-compatible). Full explanation and setup steps are in
   `sbt-desktop-kit`'s README. **Explicitly not adopted**: Nx or Turborepo specifically — npm's
   built-in `workspaces` field was sufficient, no additional build-orchestration tool needed.
   **Still true from the original non-goal**: this doesn't merge git histories or move any repo
   into a monorepo folder structure — each of the three keeps its own `.git`, remote, and history;
   the workspace root is a pure npm/dependency-resolution construct, invisible to git. Each repo's
   own `package.json` still fully declares its own dependencies, so a standalone clone of any one
   repo still builds without the workspace root present.
   **Known gap, deferred on purpose**: this doesn't fix CI/release builds, which check out a
   single repo in isolation — that needs the kit pushed to GitHub, tagged, and referenced as a
   real git dependency in each app's `package.json` (decision 7 above). Documented as a blocker in
   `sbt-desktop-kit`'s README; not resolved yet.

## 8. Explicit non-goals (v2)

- Not merging the two apps' git histories or moving either into a monorepo folder structure.
- ~~Not adopting Nx/Turborepo/pnpm-workspaces~~ — **partially reversed, §7 item 9.** An optional
  local npm workspace was adopted to fix a confirmed cross-repo dependency-duplication bug; Nx/
  Turborepo specifically remain unadopted (unnecessary), and nothing here merges git histories or
  monorepo-folders the three repos — see item 9 for the full reasoning.
- ~~Not unifying Zustand versions (4 vs 5)~~ — **superseded, now a goal, §2.** FlexMQTT bumps to
  5 in Phase A alongside React.
- Not unifying routing — RustyCAN's Zustand `view` switch and FlexMQTT's
  `react-router-dom` both stay; the shared Sidebar/Navbar takes an `onSelect` callback so either
  routing style plugs in.
- *(Superseded from v1: Tailwind and UI-kit unification are now explicit goals, not non-goals —
  see §2.)*
