---
name: "broken
colors:
  primary: "#000000"
---

## Overview

This DESIGN.md has an unclosed string in the frontmatter. The `name` field opens a double-quoted YAML string but never closes it. YAML parsers should reject this file.
