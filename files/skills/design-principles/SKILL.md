---
name: design-principles
description: >-
  Use automatically for non-trivial product, UX, UI, API, CLI, architecture,
  code-organization, and interaction decisions. Apply Apple and Jony Ive-inspired
  principles of purpose, reduction, clarity, hierarchy, coherence, agency,
  responsibility, accessibility, and craft without copying Apple branding.
metadata:
  status: active
  scope: global
---

# Design Principles

A design is not a surface placed on top of implementation. It is the whole
relationship between purpose, behavior, structure, language, visual form, and
quality.

This skill is inspired by public Apple Human Interface Guidelines, public Jony
Ive interviews, Dieter Rams, usability research, accessibility standards, and
software architecture guidance. It is not official Apple or Jony Ive doctrine.
Use principles as judgment tools, not as a visual style or rigid formula.

## Precedence

Resolve conflicts in this order:

1. User requirements and explicit product goals.
2. Project instructions, existing contracts, and established conventions.
3. Correctness, security, privacy, accessibility, reliability, recoverability,
   operability, and performance requirements.
4. This skill's design principles.
5. Personal taste, novelty, and visual fashion.

“Simpler” never means less accessible, less safe, less correct, less observable,
or less recoverable. Do not remove necessary capability to make a result look
clean.

## When to apply

Apply this skill to:

- New features, flows, screens, APIs, commands, and data models.
- Refactors, architecture, module boundaries, and public contracts.
- Bug fixes that expose confusing behavior or missing states.
- Copy, naming, error messages, documentation, and onboarding.
- Visual design, interaction design, responsive behavior, and design-system use.
- Reviews where the result feels cluttered, arbitrary, inconsistent, fragile, or
  difficult to understand.

Do not turn a trivial edit into a design exercise. For small, local changes,
keep the lens internal and make the smallest correct edit.

## Core principles

### 1. Start with purpose

Name the human outcome before choosing a feature, component, abstraction, or
style.

- State who needs what, in what context, and what success looks like.
- Separate the essential outcome from requested implementation details.
- Remove work that does not serve the outcome.
- If the requested change has no clear purpose, ask one concise blocking
  question with a recommended interpretation. Otherwise proceed.

Every feature consumes time, attention, trust, code ownership, and operational
capacity. Spend those resources deliberately.

### 2. Make simplicity emerge from the core

Do not make a complex system appear simple by hiding its important behavior.
Make the underlying model, flow, and implementation simpler first.

- Prefer one clear mental model over several special cases.
- Prefer ordinary platform conventions over custom interaction.
- Prefer fewer concepts and fewer transitions when capability remains intact.
- Remove unnecessary steps, options, dependencies, state, and abstraction.
- Keep necessary complexity explicit, named, and understandable.
- Do not add a cosmetic layer that conceals a confused data model or fragile
  architecture.

Ask repeatedly: “Can one concept, component, or operation do this job without
creating a hidden exception?”

### 3. Reduce cognitive and edit surface

Reduction is not deletion for its own sake. It is disciplined removal of
anything that does not earn its place.

- Put frequent, primary actions first.
- Use progressive disclosure for specialized options.
- Keep labels, commands, APIs, and code names concrete and familiar.
- Avoid duplicate controls, duplicate sources of truth, and parallel paths
  with different semantics.
- Prefer a small coherent change over a broad speculative refactor.
- Limit the number of files, concepts, and dependencies touched when behavior
  does not require more.

Do not hide rare but important actions, policy, error, status, or recovery
information merely to reduce visible density.

### 4. Establish hierarchy and deference

The product's purpose must be easier to perceive than its decoration or
implementation machinery.

- Establish one primary outcome per view, flow, command, or public operation.
- Give primary content and actions the strongest semantic and visual position.
- Let content and user intent lead; controls and chrome support them.
- Use order, grouping, spacing, naming, contrast, and structure to show what
  matters.
- Use progressive disclosure instead of presenting every option at once.
- Avoid competing focal points and ornamental motion.

For non-visual systems, hierarchy means command structure, API shape, defaults,
output order, log priority, and error priority.

### 5. Prefer familiarity and consistency

People should be able to predict behavior from prior experience and from the
rest of the product.

- Reuse existing project patterns before inventing new ones.
- Make equivalent things look, read, and behave equivalently.
- Use platform conventions for navigation, input, focus, keyboard behavior,
  loading, cancellation, and destructive actions.
- Keep terminology stable. One concept gets one name unless a real audience
  distinction requires another.
- Make API, CLI, UI, and documentation vocabulary agree.
- When breaking a convention, state the user benefit and validate the change.

Consistency is not an excuse to preserve a known bad pattern. Improve the
pattern deliberately and update all affected surfaces.

### 6. Preserve agency and forgiveness

People remain in control of their work, data, and decisions.

- Do not trap users in a predetermined path when a direct path is clear.
- Support cancel, back, retry, undo, draft preservation, or safe recovery when
  the operation can fail or cause loss.
- Make destructive or irreversible actions explicit and proportionate.
- Confirm only high-consequence actions; do not interrupt ordinary flow with
  needless confirmation.
- Never silently discard input or change user data.
- For APIs and CLIs, use explicit flags, dry runs, idempotence, and clear exit
  behavior where the operation warrants them.

A good default makes the safe, expected action easy without taking control away.

### 7. Give clear feedback and complete states

Every meaningful operation needs an understandable response.

For each flow or operation, model at least:

- Initial and empty state.
- Ready and active state.
- Loading or pending state.
- Success state.
- Validation and recoverable error state.
- Permission or authentication state when relevant.
- Offline, timeout, partial-failure, and retry state when relevant.
- Destructive, canceled, and interrupted state when relevant.

Then make each state observable through the appropriate channel: content,
status, progress, focus, announcement, return value, exit code, log, metric, or
trace.

Do not claim success before the system has evidence of success. Do not make
users infer whether an action happened.

### 8. Design for everyone and for real conditions

Accessibility and inclusion begin at the model and interaction level, not at
final polish.

- Preserve semantic structure and meaningful names.
- Support keyboard, screen readers, voice control, touch, and other relevant
  input methods.
- Do not use color, motion, sound, hover, or position as the only signal.
- Support text resizing, contrast, reduced motion, localization, and content
  variation where relevant.
- Keep focus, reading order, target size, and error recovery coherent.
- Test with assistive technology and people with relevant needs when the
  environment supports it.
- Treat WCAG and platform accessibility requirements as testable constraints,
  not optional style guidance.

An interface that is elegant for one ideal user but unusable for others is not
well designed.

### 9. Treat responsibility as part of the experience

Trust is a design property.

- Request only data and permissions that the outcome requires.
- Ask at the right moment and explain why access is needed.
- Minimize collection, retention, exposure, and privilege.
- Consider misuse, abuse, privacy leakage, unsafe defaults, and harmful edge
  cases before adding capability.
- Make security and policy boundaries explicit in code and user language.
- Do not make a dangerous operation feel harmless through friendly styling.

When a feature uses AI or automation, expose uncertainty, source of truth,
review points, and recovery paths. Never present guesses as confirmed facts.

### 10. Align form, behavior, and implementation

A result has integrity when its visible behavior, internal structure, and
operational reality agree.

- Let domain boundaries follow the problem, not arbitrary framework layers.
- Keep related behavior cohesive and unrelated behavior decoupled.
- Encapsulate volatile implementation details behind explicit contracts.
- Prefer boring, testable structures over clever abstractions.
- Make performance, reliability, observability, and failure behavior part of
  the design, not an afterthought.
- Keep documentation, UI copy, API contracts, logs, and tests in the same
  vocabulary.
- Understand the actual material of the system: framework behavior, runtime,
  data shape, deployment model, device constraints, and failure modes.

Do not force a visual or architectural style onto a system when the substrate
calls for another solution.

### 11. Care about the last visible and invisible detail

Craft means finishing the whole experience, not polishing one happy path.

- Inspect boundaries, transitions, empty states, errors, long text, slow paths,
  localization, and recovery.
- Remove awkward defaults, unexplained terminology, dead controls, and stale
  states.
- Keep details that users may not notice consciously but that affect trust,
  clarity, speed, or correctness.
- Prefer material improvements over change for novelty.
- Validate on the real target substrate, not only in an ideal mock or isolated
  unit.

Details must serve purpose. Do not add detail merely to signal effort.

## Operating workflow

For non-trivial work, use this sequence. Pair it with the Software Delivery
Loop: SDL owns intake, validation, and outcome reporting; this skill owns the
design-quality lens.

1. **Understand.** Inspect project instructions, existing patterns, user flows,
   contracts, tests, and runtime constraints before proposing structure.
2. **Frame.** Write a compact design intent: primary user outcome, primary
   action or contract, non-goals, constraints, and success evidence.
3. **Map.** Identify the main path, competing choices, system states, failure
   modes, accessibility needs, and irreversible effects.
4. **Reduce.** Remove unnecessary steps, options, concepts, dependencies, and
   touched files. Keep necessary complexity visible.
5. **Choose.** Select the smallest coherent solution that preserves the
   precedence rules and existing conventions.
6. **Integrate.** Make behavior, copy, visual form, data model, code structure,
   and tests express one mental model.
7. **Validate.** Check primary and edge paths on the real substrate. Run tests,
   type checks, lint, accessibility checks, and relevant operational checks.
8. **Report.** State what changed, the key tradeoff, validation evidence, and
   remaining uncertainty. Do not perform process theater for a trivial change.

Ask the user only when an unresolved decision changes scope, architecture,
security, irreversible behavior, or acceptance criteria. Otherwise infer from
project conventions and proceed.

## Task-specific application

### UI and interaction

- Identify the primary task before arranging components.
- Put primary content and action first.
- Use familiar controls with explicit labels.
- Define all meaningful states before styling.
- Keep focus and keyboard order logical.
- Test viewport, text-length, contrast, reduced-motion, and assistive-technology
  behavior.
- Avoid gradients, shadows, animation, rounded cards, or visual effects unless
  they communicate structure or serve the product reference.

### API and CLI

- Design around user goals and domain concepts, not database tables or
  internal classes.
- Use predictable names, defaults, input validation, output shape, exit codes,
  pagination, and versioning.
- Make destructive operations explicit and support preview, idempotence, or
  rollback where appropriate.
- Return actionable errors with cause, location, and recovery guidance.
- Keep machine-readable output stable and human-readable output useful.

### Architecture and code organization

- Define the responsibility and invariant of each module.
- Prefer high cohesion, low coupling, explicit interfaces, and local reasoning.
- Keep domain logic independent from volatile infrastructure when practical.
- Avoid abstractions without a present use, speculative extension points, and
  framework-shaped boundaries that hide the domain.
- Add observability and failure handling according to real reliability needs.
- Preserve compatibility unless the user explicitly authorizes a breaking
  change.

### Bug fixes

- Reproduce the user-visible failure.
- Find the broken invariant or confusing state, not only the symptom.
- Prefer a root-cause fix that simplifies behavior over a narrow patch that
  adds another exception.
- Add regression coverage for the failure and relevant adjacent states.
- Confirm that the fix does not remove recovery, accessibility, security, or
  observability.

### Project initialization

- Establish the smallest coherent foundation for the stated outcome.
- Choose defaults that are understandable, accessible, testable, and easy to
  change.
- Avoid adding infrastructure, packages, screens, or abstractions without a
  current requirement.
- Define the first useful path and its failure behavior before broadening scope.

## Review gate

Before handoff, answer these questions briefly for non-trivial work:

1. What human or system outcome does this serve?
2. What was removed or deliberately left out, and why?
3. Is the primary path obvious? Is secondary complexity staged rather than
   hidden?
4. Are terminology, behavior, architecture, and documentation consistent?
5. Can users or callers cancel, undo, retry, or recover where needed?
6. Are loading, empty, success, error, permission, partial, and destructive
   states handled as applicable?
7. Does the result work for relevant accessibility needs and real conditions?
8. Are privacy, security, reliability, performance, and observability needs
   preserved?
9. Does implementation structure express the domain and keep change local?
10. What evidence shows the result works on its actual substrate?

If an answer is “no,” fix the design or state the concrete tradeoff. Do not hide
the gap behind visual polish or the word “simple.”

## Anti-patterns

Reject these patterns unless a documented requirement justifies them:

- **Apple cosplay:** copying colors, rounded shapes, animations, or marketing
  language instead of applying purpose and coherence.
- **Minimalism as concealment:** hiding labels, status, settings, errors, or
  recovery to make a screen or API look clean.
- **Novelty over improvement:** changing familiar behavior without a material
  user benefit.
- **Feature accumulation:** adding options because competitors or stakeholders
  mention them without a defined outcome.
- **Surface-first design:** styling before understanding data, states, contracts,
  constraints, or failure modes.
- **Polished happy path:** ignoring empty, slow, invalid, offline, permission,
  partial, localization, or assistive-technology states.
- **Confirmation theater:** asking users to confirm every action instead of
  making routine actions reversible and dangerous actions explicit.
- **Abstraction theater:** adding layers, design tokens, services, or helpers
  that have no current responsibility or testable benefit.
- **Inconsistent exceptions:** making one screen, command, or module special
  without a user-facing reason.
- **Accessibility afterthought:** treating labels, keyboard support, contrast,
  text scaling, or reduced motion as cleanup.
- **Unverifiable confidence:** claiming a design works without tests, real
  substrate checks, or evidence for the relevant states.

## Research anchors

Use these sources when a design rationale needs support. Cite only the relevant
source; do not add citation noise to ordinary implementation work.

- Apple HIG design principles: <https://developer.apple.com/design/human-interface-guidelines/design-principles>
- Apple HIG accessibility: <https://developer.apple.com/design/human-interface-guidelines/accessibility>
- Apple WWDC26, “Principles of great design”: <https://developer.apple.com/videos/play/wwdc2026/250/>
- Apple WWDC17, “Essential Design Principles”: <https://developer.apple.com/videos/play/wwdc2017/802/>
- Jony Ive interview, The New York Times: <https://archive.nytimes.com/bits.blogs.nytimes.com/2014/06/16/jonathan-ive-on-apples-design-process-and-product-philosophy/>
- Jony Ive interview, Dazed: <https://www.dazeddigital.com/artsandculture/article/33692/1/discussing-design-with-the-man-behind-your-iphone>
- Dieter Rams Foundation: <https://rams-foundation.org/foundation/design-comprehension/theses/>
- W3C WCAG 2.2: <https://www.w3.org/TR/WCAG22/Overview.html>
- W3C involving users in accessibility: <https://www.w3.org/WAI/planning/involving-users/>
- Nielsen Norman Group, progressive disclosure: <https://www.nngroup.com/articles/progressive-disclosure/>
- Microsoft Azure Well-Architected, simplicity: <https://learn.microsoft.com/en-us/azure/well-architected/reliability/simplify>
- Google Cloud Well-Architected Framework: <https://docs.cloud.google.com/architecture/framework>
