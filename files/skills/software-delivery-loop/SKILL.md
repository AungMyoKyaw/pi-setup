---
name: software-delivery-loop
description: >-
  Plan, execute, validate, and measure non-trivial software engineering work
  including features, bug fixes, project initialization, migrations,
  architecture changes, and deployment preparation. Use automatically for
  these tasks; skip simple questions and tiny edits. Also trigger when the user
  says "SDL", "software delivery loop", "software deliver loop", or
  "delivery loop".
metadata:
  status: experimental
  scope: global
---

# Software Delivery Loop

## Purpose

Provide an autonomous, feedback-efficient operating model for non-trivial software engineering work while preserving human control over product decisions, irreversible actions, and external side effects.

## Trigger and routing

Automatically apply this workflow to:

- New features
- Bug fixes requiring investigation
- New project or service initialization
- Architecture changes
- Migrations
- Deployment preparation
- Security-sensitive engineering work

Bypass the workflow for simple explanations, read-only investigation, formatting, obvious one-line edits, and routine commands unless the user explicitly requests the workflow.

When task classification is uncertain, prefer applying the workflow.

## Required dependencies

Before planning, confirm that these skills are available at runtime:

- `grill-me`
- `loop-me`
- `grilling` (transitive dependency)

If a required dependency is missing, stop and ask the user to restore or install it. Never install it automatically. Never copy, substitute, or silently bypass a missing dependency.

Dependency roles:

- `grill-me`: interrogate non-trivial requirements and design decisions.
- `loop-me`: create or revise recurring workflow specifications.
- `grilling`: provide the stateful, round-based questioning protocol.
- This skill: execute the approved software task, validate it, and measure the result.

`loop-me` is required for workflow-design work but should not be forced into every ordinary feature or bug-fix run.

## Context preflight

Read context in this order:

1. Global `AGENTS.md`
2. Relevant topics from global `MEMORY.md`
3. Project `AGENTS.md` or equivalent project instructions
4. Project README and architecture documentation
5. Package manifests, scripts, tests, CI, deployment, and security files as needed

Do not reread unrelated memory or documentation merely to satisfy the checklist.

## Intake and projection

Before implementation, produce a structured projection containing:

- Requirement interpretation
- Explicit requirements
- Non-goals
- Known preferences and project conventions
- Assumptions
- Recommended plan
- Expected outcome
- Acceptance criteria
- Risks and uncertainty
- Required checkpoints
- Questions that genuinely block execution

Use `grill-me` for unresolved non-trivial requirements and design decisions. Ask questions one round at a time and attach a recommended answer to each question.

Ask only questions whose answers affect requirements, architecture, irreversible actions, security, deployment, or acceptance criteria. Infer ordinary implementation choices from project conventions and stored preferences.

## Autonomy and checkpoints

After blocking decisions are resolved, work autonomously through inspection, implementation, testing, debugging, documentation, and local validation.

Push human review as late as practical. Present one concise brief containing the prepared work, risks, recommendation, and exact decision required.

Approval is required before:

- Production deployment
- Pushing to a remote repository
- Opening pull requests or issues
- External communication
- Destructive migrations or data deletion
- Authentication, authorization, or security-boundary changes
- Other irreversible external side effects

## Execution

1. Inspect the repository and establish a baseline.
2. Implement the smallest coherent slice of work.
3. Run relevant tests, linters, type checks, builds, and validation commands.
4. Diagnose and fix failures automatically.
5. Repeat validation after every corrective change.
6. Create local commits only after validation passes.
7. Ask before pushing, opening pull requests, deploying, or communicating externally.

## Failure handling

When validation fails:

1. Preserve the failure evidence.
2. Identify the root cause.
3. Apply the smallest appropriate fix.
4. Rerun the failed validation and related checks.
5. Continue until validation passes or a genuine user decision is required.

Do not hide failures, weaken tests, skip required checks, or claim success without evidence.

## Run artifacts

Store per-task artifacts outside project repositories by default:

```text
~/.agents/runs/<date>/<run-id>/
```

At minimum, record:

- `projection.md`
- `decisions.md`
- `validation.md`
- `outcome.md`

Only write these artifacts into a project repository when the project explicitly requires committed plans or reports.

## Outcome report

The final report must contain:

- Work completed
- Validation evidence
- Actual outcome
- Projection versus reality
- Human feedback turns
- Token and time cost when available
- Rework or missed requirements
- Remaining risks
- Proposed preference or workflow updates

## Memory and preference updates

Never silently record a new personal preference.

Propose a focused diff to the appropriate global or project memory file and wait for user approval before writing it.

Instruction precedence is:

```text
Current user request
> Project instructions
> Global preferences and memory
> Workflow defaults
> Agent assumptions
```

## Interruption and resumption

If interrupted or cancelled:

- Preserve the current repository state.
- Record completed work, failed checks, and remaining work.
- Make resumption possible without repeating completed investigation.
- Never perform an unrequested destructive rollback.

## Definition of done

A task is complete when:

- Requirements and acceptance criteria are satisfied.
- Relevant validation passes.
- Evidence is recorded.
- Actual results are compared with the projection.
- No unresolved implementation decision remains.
- Required approvals have been obtained.

## Evaluation gate

Before promoting this workflow into a permanent agent skill, evaluate it on at least:

1. A new feature
2. A bug fix
3. A project initialization task

Compare fresh baseline runs with and without the workflow. Measure feedback turns, tokens, duration, missed requirements, rework, validation quality, and incorrect assumptions.

Keep the skill only if it reduces feedback effort while preserving or improving correctness and does not create disproportionate token or time overhead.

## Evolution

Review run reports and user corrections after real tasks. Propose focused changes, evaluate them against the existing baseline, and update this skill only when the change improves results.
