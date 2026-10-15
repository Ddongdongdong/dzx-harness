# Agent Note: Mechanical quality gates over prose guidelines

Status: implemented

English | [中文](2026-06-11-quality-gates.zh.md)

The hook/CI symmetry in this record is superseded by [Fast local Git hooks](../../archived/process/2026-07-22-fast-local-git-hooks.md); CI remains the exhaustive enforcement path.

## Problem

This codebase is developed primarily by coding agents. Agents follow enforced gates far more reliably than prose conventions, and "a lot of work" is not a cost argument when agents do the labor. Early evidence: tests that didn't typecheck shipped (vitest doesn't typecheck) and were only caught by a review.

## Decision

Every mechanically checkable AGENTS.md promise gets a command that exits non-zero. CI invokes the exhaustive set, while Git hooks reserve their latency budget for cheap local defects:

- Max-strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …); examples, tests, and scripts typecheck in CI via the root no-emit `tsconfig.json` while package/vendor code stays behind its own project-reference boundary.
- [Oxlint](../../archived/process/2026-07-29-oxlint-linter.md) with type-aware TypeScript rules plus the @stylistic and SonarJS compatibility plugins, enforcing the house style and file-local duplicated-logic checks; vendored code excluded.
- jscpd detects cross-file clones in package production TypeScript and repository scripts; narrow source-range exceptions document deliberately parallel implementations.
- Per-file 100% coverage on `packages/*/*/src` (v8); unreachable defensive guards carry `/* v8 ignore */ ` with stated reasons instead of deletion.
- publint (package correctness), workspace constraints (workspace rules: private, cordis peer+dev, uniform version, ESM), and a NodeNext consumer typecheck for built package declarations. [The unused-code gate removal](2026-08-19-remove-knip.md) records why static dead-code scanning is outside this suite.
- lefthook pre-commit applies project-free Oxlint validation and [safe fixes with a bounded retry](../../archived/process/2026-08-09-oxlint-only-fix-workflow.md), rejects staged whitespace, and checks the vendor manifest; pre-push runs incremental typecheck. CI runs the full matrix on node 22.19/24/26 plus built application smokes for the Headless, TUI, ACP, JSON-RPC, workflow, and ptc-runtime entry paths.
- Deterministic engineering budgets cap the aggregate byte and line counts of the generated Cordis runtime catalogs and the `doc-sync` leaf inventory. They protect generated-source and orchestration complexity without presenting static counts as bundle size, startup latency, or gate duration; those measurements require built artifacts or calibrated runners.
- The CI artifact lane caps the raw bytes of the shipped Host Cordis entrypoint, Client runner entrypoint, and their aggregate after its shared build. Raw bytes are reproducible across compressor versions; machine-sensitive startup, time, and memory measurements remain in the benchmark lane.

Local check selection remains a maintainer decision rather than another gate. `affected-check` accepts an explicit base, includes committed and dirty worktree paths, reports runtime and peer dependency consumers for changed Harness packages, and suggests commands with reasons. It never runs those commands or permits CI to skip work; unclassified paths stay visible for manual selection because configuration, dynamic loading, subprocess, snapshot, and external-provider relationships are not complete package-graph edges.

## Consequences

- Conventions survive agent turnover; cheap commit/push defects fail locally and exhaustive violations fail in CI.
- The gates themselves are code to maintain; config changes are reviewed like any change.
- The advisory report can reduce dependency-graph lookup work without claiming complete test selection; its usefulness and false-positive rate can evolve independently from required CI.
- Source and built raw-byte budgets provide reproducible ratchets and attributable failures, while machine-sensitive time and memory budgets remain in the isolated benchmark lane.
- 100%-coverage pressure can produce assertion-free tests — mutation testing is the planned counterweight (see [the mutation-testing proposal](../../proposed/testing/2026-06-11-mutation-testing.md)).

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
