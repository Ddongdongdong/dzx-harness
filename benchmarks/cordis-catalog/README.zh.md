# Cordis 目录运行时基准

[English](README.md) | 中文

此目录包含运行时插件发现所需的必需 Node 预算，以及一个无阈值的浏览器诊断。Node 用例会在全新进程中加载携带目录的已发布 Host package 入口，并序列化 Host 和 Client 目录的完整渐进查询负载。Client 查询负载还会读取每个生成的 Slot 条目。

运行 `pnpm run build:bench` 和 `pnpm run build:web`，然后通过 `vitest.bench.config.ts` 选择 `benchmarks/cordis-catalog/`。计时 Node worker 是普通 Node 下的编译后 JavaScript。Host 冷加载样本在 worker 启动后动态导入构建出的 package 入口；生成的查询函数有意不属于 package 公开导出，因此查询 worker 会编译私有集成适配器。由 Host 编排的浏览器用例通过已发布 Web scaffold 驱动构建后的 Client artifact。

每项 Node 测量报告五个全新进程样本。Host 加载预算使用中位数，并限制导入模块在 GC 后保留的最大 heap。查询预算使用一次完整 sweep 的中位耗时；sweep 覆盖目录及每个精确 Service、Event 和适用的 Slot 查询，并包含 JSON 序列化。

Client 冷加载诊断报告五个全新 scaffold 和浏览器样本。计时从实际 application combo resource 请求开始，到 `@deepseek-ai/dsh-cordis-client-runner` factory 完成物化为止；独立字段分别报告传输至注册的耗时和 factory 执行耗时。这个区间包含 loopback 传输、combo script 解析与求值，以及模块物化。结构断言要求已发布 graph row 和 application batch、一次注册和一次 factory 调用、`apply` 导出、正数 resource bytes，以及 Host 收到完整的 `Builtin`、`Event`、`Service`、`Slots` 和 `Theme` Client provider manifest。

浏览器计时目前只作为证据，不设通过或失败阈值。强制计时门禁需要来自实际托管 benchmark 浏览器与 runner 的至少两次重复运行样本；这些证据将用于设定固定源码预算，以及已记录样本的接受控制和高一毫秒的拒绝控制。计时间隔不包含 scaffold Host 启动、浏览器启动、factory 物化后的完整 UI mount、模型或外部网络工作、浏览器绘制，以及无关插件组合。
