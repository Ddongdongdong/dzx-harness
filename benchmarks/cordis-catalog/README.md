# Cordis catalog runtime benchmark

English | [中文](README.zh.md)

This directory contains required Node budgets and a threshold-free browser diagnostic for runtime plugin discovery. The Node cases load the shipped Host catalog-bearing package entry in a fresh process and serialize the complete progressive query workload for Host and Client catalogs. The Client query workload also reads every generated Slot entry.

Run `pnpm run build:bench` and `pnpm run build:web`, then select `benchmarks/cordis-catalog/` with `vitest.bench.config.ts`. Timed Node workers are compiled JavaScript under plain Node. Host cold-load samples dynamically import the built package entry after the worker starts; query workers compile private integration adapters because the generated query functions are intentionally absent from public package exports. The Host-orchestrated browser case drives the built Client artifacts through the shipped Web scaffold.

Each Node measurement reports five fresh-process samples. The Host load budget uses the median and bounds the maximum post-GC heap retained by the imported module. Query budgets use the median duration of one complete sweep across the directory and every exact Service, Event, and applicable Slot query, including JSON serialization.

The Client cold-load diagnostic reports five fresh scaffold and browser samples. Its clock starts at the actual application combo resource request and ends when the `@deepseek-ai/dsh-cordis-client-runner` factory has materialized; separate fields report transport-through-registration and factory execution. The interval includes loopback transport, combo script parsing and evaluation, and module materialization. Structural assertions require the shipped graph row and application batch, one registration and factory call, an `apply` export, positive resource bytes, and Host receipt of the complete `Builtin`, `Event`, `Service`, `Slots`, and `Theme` Client provider manifest.

Browser timings are evidence only and currently have no pass/fail threshold. A required timing gate needs repeated samples from at least two runs on the actual hosted benchmark browser and runner; that evidence will set a fixed source budget and recorded-sample acceptance plus one-millisecond-above rejection controls. Scaffold Host boot, browser launch, complete UI mount after factory materialization, model or external network work, browser painting, and unrelated plugin composition are excluded from the measured interval.
