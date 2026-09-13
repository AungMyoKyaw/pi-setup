# Stylistic defaults

- **Prefer Tailwind utilities over vanilla CSS** in projects where Tailwind is
  already installed. Use `<style>` blocks only for things Tailwind can't
  express cleanly: per-element runtime colors via CSS custom properties,
  dynamic state combinations Tailwind doesn't compose well (e.g.
  selected + active + completed simultaneously), SVG internals, and
  scroll/overflow affordances. When a project has a design token system
  in DESIGN.md, expose the tokens as Tailwind v4 `@theme` so they become
  utilities (e.g. `--color-df-primary` → `bg-df-primary`).
