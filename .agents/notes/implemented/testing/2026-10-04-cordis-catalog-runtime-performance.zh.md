# Agent Note: Cordis 目录运行时性能预算

Status: implemented

[English](2026-10-04-cordis-catalog-runtime-performance.md) | 中文

## 问题

生成的 Cordis 目录体积较大，因此即使 JSON 响应保持不变，表示方式的变化也可能影响模块加载、保留内存和渐进式检查查询。源码与构建产物原始字节预算可以发现体积增长，但不能测量运行时成本。因此，修改生成表示以压缩目录之前，需要建立可复现的基线。

## 决定

必需的 Node benchmark lane 测量已发布 Host 目录入口，以及生产 Host 与 Client 查询实现。每个 case 都在普通 Node 下运行五个全新的编译后 worker，并以中位数执行预算断言。Benchmark 保持在 `benchmarks/cordis-catalog/` 内部；生产 package 不为测量新增导出。

Host 冷加载 worker 在计时前启动并执行显式垃圾回收，然后动态导入构建后的 `@deepseek-ai/dsh-tool-cordis` 入口，停止计时，并在导入模块仍可达时再次回收，报告导入墙钟时间与保留的 `heapUsed`。Host 查询 worker 通过编译后的私有 adapter 调用生产 `queryServiceApi` 与 `queryEventApi` 实现。Client 查询 worker 调用生产 `clientInspectProviders` 实现。每个查询样本执行三次相同的全目录 sweep，并报告单次 sweep 耗时。

查询端点包含目录列表、每个精确 Service 与 Event 查询、每个适用的 Client Slot 查询，以及 JSON 序列化。Host sweep 覆盖 81 个 Service 与 75 个 Event，共 158 次操作并输出 1,040,931 字节。Client sweep 覆盖 8 个 Service、4 个 Event 和 70 个 Slot，共 85 次操作并输出 224,384 字节。这些长尾负载保护完整目录遍历，不代表一次普通精确查询的延迟。

现有 `ciTimeBudget()` 校准为参考机器预期应用共享的 2 倍 CI 机器缩放和 1.25 倍方差余量。Host 加载、Host 查询 sweep 与 Client 查询 sweep 的参考机器预期分别为 30 ms、420 ms 与 8 ms，对应时间预算为 75 ms、1,050 ms 与 20 ms。Host 保留 heap 使用独立的 8 MiB 上限，不随 CPU 缩放。

| 测量卡字段 | 记录的决定 |
|---|---|
| 用户操作 | 在全新进程中加载已发布 Host 目录入口；序列化每个渐进式 Host 或 Client 目录查询 |
| 工作负载 | 每个 case 使用五个全新 worker；每个查询 worker 执行三次完整 sweep；固定生成目录与操作数 |
| 入口路径 | 构建后的 Host package 入口、生产 Host 查询函数，以及通过私有编译 adapter 调用的生产 Client inspect provider |
| 计时 | Host 加载包含动态导入，查询 sweep 包含查询与序列化；排除构建、worker 启动、IPC、模型、传输、浏览器渲染和无关插件组合 |
| 内存 | 已导入 Host 入口在 GC 后保留的最大 `heapUsed`；不声明瞬时分配或 Client 内存 |
| 判定 | 五个原始样本、中位耗时、固定源码预算、最大保留 heap，以及收紧预算的负向控制 |
| 行为 | 现有生成器、查询、provider 与 snapshot 测试拥有响应等价性；benchmark 检查完成、计数、字节与预算 |

已发布 Client 入口是 `window.__ModuleLoader__` 包装，在普通 Node 下会因缺少 `window` 而失败。因此 Client 浏览器冷加载仍未校准，Client 查询 worker 不代表该指标。浏览器启动预算需要先在受支持的浏览器 runner 上进行重复测量，之后才能成为必需门禁。

## 校准证据

Host 冷加载样本为 33.63、25.23、26.14、25.44 和 23.88 ms，中位数为 25.44 ms，预算为 75 ms。最大保留 heap 约为 4.24 MiB，上限为 8 MiB。

Host 完整查询样本每次 sweep 分别为 390.21、387.66、388.73、419.81 和 386.52 ms，中位数为 388.73 ms，预算为 1,050 ms。Client 完整查询样本每次 sweep 分别为 5.05、5.09、5.16、5.07 和 5.17 ms，中位数为 5.09 ms，预算为 20 ms。

负向控制只把 Host 参考预期从 420 ms 降至 150 ms，得到校准后的 375 ms 预算。未改变的生产工作负载报告 390.86 ms 中位数，并按预期使断言失败。恢复经审阅的 420 ms 预期后，三个 case 全部通过。

这些测量于 2026-10-04 在当前构建后的本地工作树上采集。它们建立可复现基线和预算执行行为，不是托管 runner 观测。[必需 Session 性能门禁](2026-09-04-session-open-performance-gate.zh.md)拥有共享 benchmark lane 与校准规则。

## 首个受保护的表示变化

首个目录改动让生成的 Client Slot 注册选项数组按 cardinality 共享，并让 framework props 数组按 scope 共享。Provider 仍把每个数组复制进 JSON 结果。三个生成目录从 760,395 bytes、11,660 行降至 709,291 bytes、10,336 行。Client runner bundle 从 298,250 降至 249,278 raw bytes（-16.4%）；Host bundle 保持 513,447 bytes，因此两者合计从 811,697 降至 762,725 bytes（-6.0%）。源码上限已收紧至 745,000 bytes 与 10,850 行；Client 与合计 bundle 上限已收紧至 262,000 和 800,000 bytes。

改动后的 Client 查询运行分别报告 5.32、5.24 与 5.18 ms 的 sweep 中位数，三者中位数为 5.24 ms。每个 sweep 仍执行 85 次操作并输出 224,384 bytes。这些数据不构成查询速度显著改善的结论；它们表明表示体积下降时，被测工作量保持不变，也没有显著消耗时间预算余量。生成器、freshness 与 Client provider 测试仍是语义证据。

## 考虑过的替代方案

**使用生成源码或 bundle 字节数作为运行时代理。** 未采用，因为字节数不能确定解析、求值、保留内存或查询成本。

**在 Node 下导入 Client bundle 并称为启动时间。** 未采用，因为已发布入口需要浏览器模块加载器与 DOM 全局对象。Node shim 测量的是不同环境，还会遗漏浏览器加载器与渲染工作。

**从生产 package 导出私有查询 helper。** 未采用，因为测量不足以作为扩大预稳定公开 API 的理由。编译后的 benchmark adapter 使用现有源码模块，不改变 package 导出。

**只测一个代表性查询。** 未采用，因为表示优化可能在目录、精确 Service、Event 与 Slot 路径之间转移工作。完整 sweep 固定了比较的输出与工作量。

## 后果

目录表示变化现在可以针对同一固定基线比较生成字节、构建产物原始字节、Host 冷加载、Host 保留 heap，以及完整 Host 与 Client 查询 sweep。响应等价性测试仍然必需，因为性能 case 完成和字节计数不能确定语义相同。

时间预算有意保留较大的 CI 方差余量，并保护较大的全目录负载。它们是退化上限，不是性能目标。Client 浏览器启动、传输、模型执行、UI fold、paint、交互响应、瞬时分配和完整 profile 启动仍不属于该 benchmark。
