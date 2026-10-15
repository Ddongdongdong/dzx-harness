# Agent Note: 移除打包会话 fixture 分支迁移器

Status: implemented

[English](2026-07-26-remove-packed-session-fixture-migrator.md) | 中文

## 问题

仓库的默认写入器和快照检查会使会话 fixture（测试前置数据）保持规范事件布局。临时命令 `migrate:packed-session-fixtures` 仅用于让携带旧版 fixture 改动的在途分支合并当前 `master`，并在不重新录制模型输出的情况下完成收敛。

过渡结束后继续保留这个仓库级写入命令，会在永久只读快照检查旁留下第二条看似有效的维护路径。

## 决策

移除临时 CLI `scripts/migrate-packed-session-fixtures.ts`、根包命令，以及仅适用于该命令的文档和诊断。保留 `scripts/session-fixture-layout.ts`、其单元测试和 `scripts/session-fixture-layout.spec.ts` 中的仓库级布局断言；这些机制定义并强制执行永久规范布局。

2026-10-02 对 `Ddongdongdong/dzx-harness` 执行的 GitHub REST 实时清单查询返回零个开放 PR（Pull Request），因此移除时没有活动分支依赖该过渡命令。

## 曾考虑的替代方案

**无限期保留该命令。** 这会让旧 fixture 转换更方便，但也会在唯一已知迁移窗口关闭后保留仓库级写入工具。只读门禁已经提供可长期保留的行为与诊断。

**随 CLI 一同移除规范布局转换模块。** 该模块不是过渡残留：快照 CI 使用它发现 fixture、解码物理记录，并与规范表示进行比较。移除该模块也会移除强制机制。

**不检查开放分支就移除命令。** 携带旧版 fixture 改动的活动分支在调整目标分支后，只能临时转换或重新录制模型输出。实时清单让这项风险在移除前可被观察。

## 后果

贡献者根据布局断言列出的文件直接修复非规范 fixture；仓库不再提供用于历史转换的受支持写入命令。规范 fixture 的发现、解码、比较和只读仓库保护仍然保留。

此次移除不会移动、覆盖或删除任何已提交的 Session generation。已发布 generation 的保留规则和相邻迁移规则保持不变。

## 验证

精确仓库搜索找不到已移除命令或文件的遗留引用。会话 fixture 布局单元测试继续覆盖规范化，并拒绝已提交的非规范 fixture。
