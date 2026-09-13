---
name: Technical Handout
description: A graduate-level computer science lecture handout in the tradition of an old established university.
colors:
  paper: "#F4F0E4"
  ink: "#1E1A14"
  vermilion: "#C3402A"
  rule-gray: "#B8B0A2"
typography:
  body:
    fontFamily: EB Garamond
    fontSize: 14px
    lineHeight: 1.5
  caption:
    fontFamily: EB Garamond
    fontSize: 11px
  monospace:
    fontFamily: IBM Plex Mono
    fontSize: 12px
rounded:
  sm: 0px
spacing:
  sm: 8px
  md: 16px
  lg: 32px
  page-margin: 96px
components:
  page-frame:
    backgroundColor: "{colors.paper}"
    padding: "{spacing.page-margin}"
  caption:
    typography: "{typography.caption}"
    textColor: "{colors.ink}"
---

## Overview

A graduate-level computer science lecture handout in the tradition of an old established university. The audience is graduate students and research engineers reading a printed handout distributed at the beginning of a seminar.

The handout is austere, informationally dense, and proudly unconcerned with first impressions. The audience knows why they are there and the handout's job is to do work, not to seduce.

## Colors

A single-ink-plus-accent system. No gradients, no tones, no Material-3 surface ladder.

- **Paper** {colors.paper} is the canvas — warmed xerox stock, never pure white.
- **Ink** {colors.ink} is graphite-warm and carries all typography, all rules, all diagram strokes; never pure black.
- **Vermilion** {colors.vermilion} is the single accent and appears only inside diagrams and chart annotations — never on typography, never on page numerals, never on metadata of any kind.
- **Rule gray** {colors.rule-gray} is reserved for hairline rules inside content (chart baselines, table dividers); never used as page-frame chrome.

## Typography

One serif at four modest sizes. No display face, no bold weight, no italics outside prose quotations.

- Body is EB Garamond at 14px / 1.5 line-height — set generously, not crammed.
- Captions and metadata are EB Garamond at 11px.
- Code, math, and identifiers are IBM Plex Mono at 12px.
- Section titles are body size, bold, no underline, no italics, no scale-up hero treatment.

## Layout

An 8-point grid with a 96px page margin. Body measure is ~70 characters per line — comfortable for a serif set at reading size.

## Components

- **page-frame** — the entire page, paper background, 96px margin. No card, no panel.
- **diagram** — a bordered region containing a figure. Borders are 1px rule-gray. Inside, vermilion is permitted; outside, no.
- **caption** — small metadata text, ink on paper, never colored.

## Do's and Don'ts

- Don't add a hero moment to the title page. A real handout title page is the first page of content, not a magazine cover.
- Don't reach for an italic standfirst beneath a large title. That is the Substack register.
- Don't add corner ornaments, chapter marks, or abstract glyphs in the margins.
- Don't color the page numeral or any other piece of metadata. Vermilion lives in diagrams only.
- Don't use a display-class serif. One family at four modest sizes.
- Don't use Bold. Anywhere.
- Don't introduce dark mode, gradients, glows, glass surfaces, drop shadows, or rounded corners.
- Do trust modest size differences. The section title is only ~1.9× body, not 5× body.
- Do let pages have visible white space. A page that ends two-thirds of the way down is correct, not under-filled.
