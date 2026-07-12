# Theme System Specification

This document defines a portable theme system for desktop engineering tools. It is intentionally framework-neutral: any desktop app can implement the same modes, palettes, density behavior, and monitor states using its own UI toolkit.

## Goals

- Support light, dark, and system mode.
- Provide multiple named palettes for different working conditions.
- Provide density levels that visibly change spacing and row capacity.
- Use semantic tokens instead of hard-coded component colors.
- Keep status colors consistent across CAN/CAN-FD monitor, transmit, decode, and error states.

## Appearance Settings

Persist this user preference shape:

```json
{
  "theme": "system",
  "palette": "default",
  "density": "comfortable"
}
```

Allowed values:

```text
theme: system | light | dark
palette: default | graphite | zeiss-blue | high-contrast | terminal | warm-neutral
density: comfortable | compact | dense
```

`system` mode resolves to `light` or `dark` based on the operating system preference. Store the requested mode separately from the resolved mode.

## Semantic Color Tokens

Every palette must define these tokens for both light and dark resolved modes:

```text
background
foreground
card
cardForeground
popover
popoverForeground
primary
primaryForeground
secondary
secondaryForeground
muted
mutedForeground
accent
accentForeground
destructive
destructiveForeground
border
input
ring
```

For CSS-based apps, use HSL components so opacity composition remains easy:

```css
--background: 210 35% 98%;
background-color: hsl(var(--background));
```

For native desktop apps, store colors as RGB/ARGB converted from the HSL values.

## Palettes

### Default

Purpose: balanced general-purpose theme.

Light base:

```text
background 0 0% 100%
foreground 0 0% 3.9%
primary 0 0% 9%
secondary 0 0% 96.1%
muted 0 0% 96.1%
accent 0 0% 96.1%
destructive 0 84.2% 60.2%
border 0 0% 89.8%
```

Dark base:

```text
background 222 47% 11%
foreground 210 40% 98%
primary 210 40% 98%
secondary 210 40% 20%
muted 210 40% 20%
accent 210 40% 20%
destructive 0 62.8% 53.9%
border 210 40% 20%
```

### Graphite

Purpose: low-distraction engineering UI.

Light:

```text
background 220 14% 96%
foreground 220 12% 12%
primary 220 10% 22%
secondary 220 12% 90%
muted 220 12% 91%
accent 210 16% 88%
border 220 12% 82%
```

Dark:

```text
background 220 13% 10%
foreground 220 12% 92%
primary 220 10% 82%
secondary 220 11% 20%
muted 220 11% 18%
accent 210 16% 24%
border 220 10% 25%
```

### Zeiss Blue

Purpose: professional blue accent palette.

Light:

```text
background 210 35% 98%
foreground 215 42% 12%
primary 211 100% 32%
secondary 210 42% 92%
muted 210 38% 93%
accent 199 85% 88%
border 210 32% 84%
```

Dark:

```text
background 216 45% 9%
foreground 210 45% 96%
primary 204 100% 68%
secondary 214 36% 20%
muted 214 34% 18%
accent 201 68% 24%
border 214 32% 24%
```

### High Contrast

Purpose: accessibility and difficult lighting conditions.

Light:

```text
background 0 0% 100%
foreground 0 0% 0%
primary 225 100% 24%
secondary 0 0% 88%
muted 0 0% 92%
accent 52 100% 50%
destructive 0 100% 40%
border 0 0% 0%
```

Dark:

```text
background 0 0% 0%
foreground 0 0% 100%
primary 52 100% 58%
secondary 0 0% 14%
muted 0 0% 14%
accent 196 100% 52%
destructive 0 100% 62%
border 0 0% 100%
```

### Terminal Trace

Purpose: long log and trace sessions.

Light:

```text
background 140 18% 96%
foreground 145 36% 12%
primary 145 62% 28%
secondary 140 16% 88%
muted 140 16% 90%
accent 154 45% 84%
border 140 14% 78%
```

Dark:

```text
background 150 35% 6%
foreground 136 65% 84%
primary 136 75% 66%
secondary 150 24% 15%
muted 150 22% 14%
accent 154 48% 18%
border 150 22% 22%
```

### Warm Neutral

Purpose: softer palette for long sessions.

Light:

```text
background 36 33% 97%
foreground 30 18% 14%
primary 24 36% 31%
secondary 35 24% 90%
muted 35 24% 91%
accent 185 28% 86%
border 35 20% 82%
```

Dark:

```text
background 30 16% 10%
foreground 36 30% 92%
primary 33 58% 72%
secondary 30 14% 20%
muted 30 14% 18%
accent 188 28% 24%
border 30 12% 25%
```

## Density Tokens

Density must affect more than font size. Apply it to table rows, button/input heights, panel padding, and gaps.

```json
{
  "comfortable": {
    "fontScale": 1.0,
    "controlHeight": 36,
    "smallControlHeight": 32,
    "tablePaddingY": 12,
    "tablePaddingX": 16,
    "decodedPreviewTablePaddingY": 6,
    "decodedPreviewTablePaddingX": 8,
    "panelPadding": 16,
    "gap": 12
  },
  "compact": {
    "fontScale": 0.93,
    "controlHeight": 32,
    "smallControlHeight": 28,
    "tablePaddingY": 4,
    "tablePaddingX": 10,
    "decodedPreviewTablePaddingY": 4,
    "decodedPreviewTablePaddingX": 6,
    "panelPadding": 12,
    "gap": 8
  },
  "dense": {
    "fontScale": 0.87,
    "controlHeight": 28,
    "smallControlHeight": 25,
    "tablePaddingY": 2,
    "tablePaddingX": 8,
    "decodedPreviewTablePaddingY": 2,
    "decodedPreviewTablePaddingX": 5,
    "panelPadding": 8,
    "gap": 6
  }
}
```

Expected effect on a typical monitor:

```text
comfortable: about 20-24 trace rows
compact: about 34-40 trace rows
dense: about 41-46 trace rows
```

Decoded preview tables should also respond to density. Compact mode should reduce decoded-preview row padding and small text by one step; dense mode should make decoded-preview rows tighter than the comfortable default.

## Monitor State Colors

Use semantic overlays so they work with every palette:

```text
rxRow: normal background
selectedRow: muted background
hoverRow: muted background at low opacity
txPendingRow: amber/yellow background at 10-15% opacity
txSentRow: blue/cyan background at 10-15% opacity
txFailedRow: destructive background at 10-15% opacity and destructive foreground
decodedErrorRow: destructive background at 10-15% opacity and destructive foreground
filterValid: emerald/green foreground and border
filterInvalid: destructive foreground and border
connected: emerald/green foreground and border
disconnected: muted foreground and border
```

Do not encode important state by color only. Include text such as `TX:pending`, `TX:sent`, `TX:failed`, or `Error 12`.

## Preview Requirements

Settings should include a live preview with:

- one RX row
- one TX sent row
- one TX failed row
- a decoded value card
- connected status badge
- primary and outline buttons
- at least one table header

The preview must update immediately when mode, palette, or density changes.

## Implementation Rules

1. Keep theme mode, palette, and density independent.
2. Store requested mode and resolved mode separately.
3. Use semantic tokens in components.
4. Avoid hard-coded palette colors inside components except for universal state colors such as destructive/error.
5. Use density tokens for repeated surfaces: tables, forms, cards, toolbars, menus.
6. Ensure high-contrast palette remains readable without relying on subtle borders.
7. Apply settings without restart.
