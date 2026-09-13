---
version: alpha
name: pi-setup
description: An amber-phosphor CRT terminal rendering a well-written man page.
colors:
  primary: "#FFB000"
  canvas: "#0C0B09"
  panel: "#16130E"
  ink: "#EDE6D6"
  ink-dim: "#8A8272"
  line: "#2A261E"
typography:
  display:
    fontFamily: JetBrains Mono
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: -0.01em
  headline:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.14em
  body:
    fontFamily: JetBrains Mono
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.14em
rounded:
  none: 0px
omitted:
  - section: spacing
    reason: Single-column man-page layout; rhythm described in prose, not a scale.
components:
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  prompt-block:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.display}"
  section-label:
    textColor: "{colors.ink-dim}"
    typography: "{typography.headline}"
  rule:
    backgroundColor: "{colors.line}"
    height: 1px
  link:
    textColor: "{colors.primary}"
  copy-button:
    textColor: "{colors.primary}"
    typography: "{typography.label}"
  check:
    textColor: "{colors.primary}"
---

# pi-setup

## Overview

An amber-phosphor CRT terminal rendering a well-written man page. The
audience is pi and CLI developers arriving from GitHub or a shared link,
reading on desktop dark-mode screens with thirty seconds of attention. The
product is a single copy-paste prompt, so the prompt block is the hero and
everything else is supporting documentation. Posture is flat, square,
monospace, one accent.

## Colors

One ink, one accent, no palette.

- **Phosphor Amber** (`{colors.primary}`) means exactly one thing:
  interactive or critical. Links, the copy button, check marks, the cursor
  block. It never appears as decoration, never fills a large
  surface, and never colors body text.
- **Canvas** (`{colors.canvas}`) is the screen. Everything sits on it.
- **Panel** (`{colors.panel}`) distinguishes exactly two surfaces — the
  prompt block and code blocks — from the canvas. It is a tone shift, not
  an elevation.
- **Ink** (`{colors.ink}`) is primary text. **Ink Dim** (`{colors.ink-dim}`)
  is secondary text: labels, captions, table headers, footers.
- **Line** (`{colors.line}`) exists only as 1px hairlines: section rules,
  table rows, block borders. It never appears as a fill.

## Typography

Monospace everywhere — JetBrains Mono with a system mono fallback. No
serif, no sans, no proportional type in any role, including buttons and
table cells.

- **Display** (`{typography.display}`) exists for exactly two things: the
  page title and the prompt block. It is the largest type on the page and
  appears nowhere else.
- **Headline** (`{typography.headline}`) is the man-page section label:
  uppercase by styling, tracked wide, set in Ink Dim.
- **Body** (`{typography.body}`) is man-page density: 15px at 1.7, measure
  capped near 72ch. No italics in any role; emphasis is caps or amber.
- **Label** (`{typography.label}`) is for buttons and micro-copy, uppercase
  by styling.

## Layout

A single left-aligned column, 760px wide, centered in the viewport with
20px padding on mobile. Generous top margin before the hero. Sections are
separated by a hairline rule paired with an uppercase section label, in the
manner of man-page section headers, with tall vertical rhythm between them.
There is no sidebar, no multi-column arrangement, no card grid. Tables run
full column width with hairline row separators.

## Elevation & Depth

Flat. Nothing is elevated, ever. The prompt block distinguishes itself
through Panel background and a hairline border only — depth is faked by
tone, never by shadow. The page contains no modals, popovers, or floating
elements.

## Shapes

Square. Every corner on the page is `{rounded.none}` — buttons, blocks,
tables, inputs. This is not "minimal rounding"; it is no rounding, stated
plainly.

## Components

- **prompt-block** — the hero artifact and the page's reason to exist.
  Panel background, hairline border, Display type, containing the exact
  prompt the visitor will paste, with a copy-button at its corner.
- **section-label** — uppercase, Ink Dim, sitting on or above a hairline
  rule; the only heading style below the page title.
- **rule** — 1px Line hairline spanning the column.
- **link** — Phosphor Amber text, underline on hover, no other decoration.
- **copy-button** — square, 1px amber border, amber Label text, transparent
  background; state changes are instant, never animated.
- **check** — the ✓ glyph in Phosphor Amber; the only mark in the profiles
  table that carries color.
- **code-block** — Panel background, hairline border, body-size mono, `$`
  prefixes for shell commands.

## Do's and Don'ts

**Do:**

1. Do set every element in the monospace stack, including buttons and table cells.
2. Do reserve Phosphor Amber strictly for interactive elements and critical marks.
3. Do let the prompt block dominate the hero — it is the product.
4. Do separate sections with hairline rules and uppercase labels, man-page fashion.
5. Do keep body copy at man-page density.
6. Do prefix shell commands with `$` in code blocks.
7. Do keep the single column left-aligned with a capped measure.

**Don't:**

8. No gradients of any kind — above all, no purple-blue "AI startup" gradient.
9. No glow, box-shadow, or text-shadow.
10. No rounded corners; 0px on every element.
11. No glassmorphism, backdrop blur, or layered transparency.
12. No emoji. Sparse functional glyphs (✓, →, $) only.
13. No stock illustration, hero imagery, or decorative icons.
14. No animation or transitions beyond instant hover state changes.
15. No marketing adjectives in copy ("seamless", "powerful", "blazing").
16. No centered body paragraphs or justified text.
17. No feature grid of cards; prose and one table carry the page.
