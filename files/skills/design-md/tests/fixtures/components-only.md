---
name: Component Library
colors:
  primary: "#0066CC"
  neutral: "#F5F5F5"
  ink: "#1A1A1A"
typography:
  body:
    fontFamily: Inter
    fontSize: 14px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    rounded: 4px
    padding: 12px
    typography: "{typography.body}"
  button-secondary:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.ink}"
    rounded: 4px
    padding: 12px
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.neutral}"
    rounded: 8px
    padding: 16px
  input:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.ink}"
    rounded: 4px
    padding: 8px
    typography: "{typography.body}"
  modal:
    backgroundColor: "{colors.neutral}"
    rounded: 12px
    padding: 24px
---

## Overview

A button and card library.

## Colors

Blue and gray.

## Components

- **button-primary** — primary call to action.
- **button-secondary** — secondary call to action.
- **card** — content container.
- **input** — text input.
- **modal** — overlay dialog.
