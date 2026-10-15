# Agent Note: Cordis catalog runtime performance budgets

Status: implemented

English | [中文](2026-10-04-cordis-catalog-runtime-performance.zh.md)

## Problem

The generated Cordis catalogs are large enough that representation changes can affect module loading, retained memory, and progressive inspection queries even when their JSON responses remain unchanged. Source and built raw-byte budgets detect size growth, but they do not measure runtime cost. Catalog compression therefore needed a reproducible baseline before changing the generated representation.

## Decision

The required Node benchmark lane measures the shipped Host catalog entry and the production Host and Client query implementations. Each case runs five fresh compiled workers under plain Node and enforces its budget against the median. The benchmark stays private to `benchmarks/cordis-catalog/`; production packages do not add exports for measurement.

The Host cold-load worker starts before timing, performs explicit garbage collection, dynamically imports the built `@deepseek-ai/dsh-tool-cordis` entry, stops the clock, collects again while the imported module remains reachable, and reports import wall time and retained `heapUsed`. The Host query worker calls the production `queryServiceApi` and `queryEventApi` implementations through a compiled private adapter. The Client query worker calls the production `clientInspectProviders` implementation. Each query sample performs three identical full-catalog sweeps and reports the per-sweep duration.

The query endpoint includes catalog listing, every exact Service and Event query, every applicable Client Slot query, and JSON serialization. The Host sweep covers 81 Services and 75 Events in 158 operations and emits 1,040,931 bytes. The Client sweep covers 8 Services, 4 Events, and 70 Slots in 85 operations and emits 224,384 bytes. These tail workloads protect complete-catalog traversal; they do not represent the latency of one ordinary exact query.

The existing `ciTimeBudget()` calibration applies the shared 2x CI machine scale and 1.25x variance headroom to reference-machine expectations of 30 ms for Host load, 420 ms for the Host query sweep, and 8 ms for the Client query sweep. The resulting time budgets are 75 ms, 1,050 ms, and 20 ms. Host retained heap has an independent 8 MiB limit and is not CPU-scaled.

| Measurement card field | Recorded decision |
|---|---|
| User operation | Load the shipped Host catalog entry in a fresh process; serialize every progressive Host or Client catalog query |
| Workload | Five fresh workers per case; three complete query sweeps per query worker; fixed generated catalogs and operation counts |
| Entry path | Built Host package entry, production Host query functions, and production Client inspect provider through private compiled adapters |
| Clock | Includes dynamic import for Host load and query plus serialization for sweeps; excludes build, worker startup, IPC, model, transport, browser rendering, and unrelated plugin composition |
| Memory | Maximum post-GC Host `heapUsed` retained by the imported entry; no transient-allocation or Client-memory claim |
| Verdict | Five raw samples, median time, fixed source budgets, maximum retained heap, and a tightened-budget negative control |
| Behavior | Existing generator, query, provider, and snapshot tests own response equivalence; the benchmark checks completion, counts, bytes, and budgets |

The published Client entry is a `window.__ModuleLoader__` wrapper and fails under plain Node because `window` is absent. Client browser cold load therefore remains uncalibrated and is not represented by the Client query worker. A browser startup budget requires repeated measurements on the supported browser runner before becoming required.

## Calibration evidence

The Host cold-load samples are 33.63, 25.23, 26.14, 25.44, and 23.88 ms, with a 25.44 ms median against the 75 ms budget. The maximum retained heap is approximately 4.24 MiB against the 8 MiB limit.

The Host full-query samples are 390.21, 387.66, 388.73, 419.81, and 386.52 ms per sweep, with a 388.73 ms median against the 1,050 ms budget. The Client full-query samples are 5.05, 5.09, 5.16, 5.07, and 5.17 ms per sweep, with a 5.09 ms median against the 20 ms budget.

The negative control lowers only the Host reference expectation from 420 ms to 150 ms, producing a 375 ms calibrated budget. The unchanged production workload reports a 390.86 ms median and fails the assertion. Restoring the reviewed 420 ms expectation makes all three cases pass.

These measurements were collected locally on 2026-10-04 from the current built worktree. They establish a reproducible baseline and enforcement behavior, not hosted-runner observations. The [required Session performance gate](2026-09-04-session-open-performance-gate.md) owns the shared benchmark-lane and calibration rules.

## First protected representation change

The first catalog change shares the generated Client Slot registration-option arrays by cardinality and framework-prop arrays by scope. Providers still clone every array into their JSON result. The three generated catalogs decrease from 760,395 bytes and 11,660 lines to 709,291 bytes and 10,336 lines. The Client runner bundle decreases from 298,250 to 249,278 raw bytes (16.4%); the Host bundle remains 513,447 bytes, so their aggregate decreases from 811,697 to 762,725 bytes (6.0%). Source ceilings were tightened to 745,000 bytes and 10,850 lines; Client and aggregate bundle ceilings were tightened to 262,000 and 800,000 bytes.

The post-change Client query runs report median sweeps of 5.32, 5.24, and 5.18 ms, whose median is 5.24 ms. Every sweep still performs 85 operations and emits 224,384 bytes. This establishes no material query-speed improvement; it shows that the representation reduction preserves the measured workload without consuming meaningful time-budget headroom. Generator, freshness, and Client provider tests remain the semantic evidence.

## Alternatives considered

**Use generated-source or bundle bytes as a runtime proxy.** Rejected because bytes cannot establish parse, evaluation, retained-memory, or query cost.

**Import the Client bundle under Node and call that startup time.** Rejected because the published entry requires the browser module loader and DOM global. A Node shim would measure a different environment and hide browser-loader and rendering work.

**Export private query helpers from production packages.** Rejected because measurement does not justify expanding pre-stable public APIs. Compiled benchmark adapters use the existing source modules without changing package exports.

**Measure one representative query.** Rejected because a representation optimization can shift work among directory, exact Service, Event, and Slot paths. A full sweep keeps the compared output and work count fixed.

## Consequences

Catalog representation changes can now compare generated bytes, built raw bytes, Host cold load, Host retained heap, and complete Host and Client query sweeps against one fixed baseline. Response-equivalence tests remain mandatory because performance completion and byte counts do not establish semantic equality.

The timing budgets intentionally retain substantial CI variance headroom and protect large full-catalog workloads. They are regression limits, not performance targets. Client browser startup, transport, model execution, UI fold, paint, interaction responsiveness, transient allocation, and complete profile launch remain outside this benchmark.
