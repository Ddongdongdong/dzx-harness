# DeepSeek Harness 三小时速成训练

## 目标

这份训练面向已经具备 TypeScript 或后端开发基础、第一次开发 DeepSeek Harness 插件的开发者。三小时结束后，你应当能够读懂插件组合、定位一次 Agent Turn、编写一个模型工具，并判断新需求应该进入配置、插件、服务、事件还是核心循环。

三小时不是为了读完全部 package。完成训练的标准是你能独立回答并实际验证以下问题：

- `Context`、Plugin、Service、`inject`、Effect 和 Event 分别解决什么问题？
- `dsh web` 如何从 profile 和 bundle 得到最终插件树？
- 一条用户消息如何经过 Session、Agent Loop、LLM 和 Tool Runtime？
- 如何使用 `--patch` 挂载自己的插件？
- 一个新能力应该使用 Tool、MCP、Skill、事件监听器还是新的 capability seam？

## 准备

在仓库根目录确认版本：

```powershell
node --version
pnpm --version
```

Node 必须是 `v22.19.0` 或 `v24+`。当前仓库要求 pnpm 11。

本训练使用两个不同配置文件：

```text
scratch-plugin/cordis.yml       纯 Cordis 教程配置
scratch-plugin/cordis.yaml      完整 Harness 的 patch 配置
```

不要混用两种格式：

```yaml
# cordis.yml：完整插件列表
- name: './src/hello.ts'
```

```yaml
# cordis.yaml：在现有 Harness 插件树中插入一项
- insert:
    - id: hello-plugin
      name: 'E:/deep/deepseek-harness/scratch-plugin/src/hello.ts'
```

## 0:00–0:30：掌握 Cordis 最小模型

### 学习目标

记住下面的关系：

```text
Context
├── Plugin：贡献能力
├── Service：供其他插件调用
├── Event：观察、包装或截断行为
└── Effect：把注册资源绑定到插件生命周期
```

当前的 `hello.ts` 已经是完整插件：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(_ctx: Context) {
  console.log('hello from my first plugin')
}
```

在 `scratch-plugin` 目录运行：

```powershell
node --import tsx ../vendor/cordis/bin.js
```

已验证输出：

```text
hello from my first plugin
```

### 必读材料

依次快速阅读：

1. [`01-first-plugin.zh.md`](../docs/cordis-tutorial/01-first-plugin.zh.md)
2. [`02-lifecycle-and-effects.zh.md`](../docs/cordis-tutorial/02-lifecycle-and-effects.zh.md)
3. [`03-services.zh.md`](../docs/cordis-tutorial/03-services.zh.md)

只抓住三个结论：

- 插件不依靠 YAML 顺序解决依赖；它通过 `inject` 等待服务。
- 注册必须跟随插件卸载而撤销；优先使用 Cordis 自带的 effect 化 API。
- 只有需要向其他插件提供公共能力时，才创建 Service。

### 动手验收

在 `hello.ts` 的 `apply()` 中加入一个计时器，并使用 `ctx.effect()` 返回清理函数。然后删除插件配置项或停止进程，确认你能解释清理函数何时运行。

## 0:30–1:00：掌握事件、配置和组合

### 学习目标

继续阅读：

1. [`04-events.zh.md`](../docs/cordis-tutorial/04-events.zh.md)
2. [`05-config.zh.md`](../docs/cordis-tutorial/05-config.zh.md)
3. [`06-composition-and-hmr.zh.md`](../docs/cordis-tutorial/06-composition-and-hmr.zh.md)

重点区分事件模式：

| 模式 | 用途 |
|---|---|
| `emit` | 同步通知所有观察者 |
| `parallel` | 并行等待所有观察者 |
| `serial` | 按顺序等待监听器 |
| `bail` | 第一个有效返回值结束分发 |
| `waterfall` | 中间件式包装；调用 `next()` 才继续 |

Harness 中最重要的是 waterfall。只想观察或补充行为的监听器必须调用 `next()`；不调用表示主动短路后续处理。

### 查看真实组合

回到仓库根目录：

```powershell
Set-Location E:\deep\deepseek-harness
pnpm dsh --profile web --dump-config
```

在输出中寻找这些 id：

```text
llm
session
tools
system-prompt
agent
agent-loop
webserver
connection
```

然后对照阅读：

- [`packages/bundle/base/cordis.patch.yml`](../packages/bundle/base/cordis.patch.yml)
- [`packages/bundle/web-app/cordis.patch.yml`](../packages/bundle/web-app/cordis.patch.yml)
- [`apps/cli/src/profile-boot.ts`](../apps/cli/src/profile-boot.ts)

### 本阶段必须能解释

```text
profile = 一个命名运行方案
bundle  = 可复用的配置层
patch   = 对已有插件树的插入、替换或配置覆盖
Loader  = 将最终配置变成运行中的 Cordis 插件树
```

## 1:00–1:40：开发第一个 Harness Tool

### 学习目标

先完整阅读 [`07-into-the-harness.zh.md`](../docs/cordis-tutorial/07-into-the-harness.zh.md)。它不需要 API Key，会使用真实 Tool Runtime 执行工具。

Tool 的最小结构是：

```text
defineTool
├── name：模型调用名称
├── description：模型选择工具的依据
├── parameters：输入 JSON Schema
├── output.schema：规范返回值
├── output.render：转换成模型可读 ContentBlock
└── execute：业务逻辑
```

不要让 `execute()` 随意拼装展示文本。它先返回由 `output.schema` 声明的规范 JSON 值，再由 `output.render()` 生成模型内容。

### 动手任务

创建 `src/current-project.ts`，实现工具 `current_project`，返回：

```json
{
  "cwd": "当前目录",
  "platform": "当前平台",
  "nodeVersion": "当前 Node 版本"
}
```

要求：

- 插件声明 `inject = ['tools']`。
- 使用 `defineTool()`。
- `execute()` 返回结构化对象。
- `output.render()` 生成人类可读文本。
- 添加一个 `tools/result` 监听器，打印工具名称和是否失败。

需要类型提示时参考：

- [`docs/cookbook/adding-a-tool.md`](../docs/cookbook/adding-a-tool.md)
- [`packages/todo/tool-todo/src/index.ts`](../packages/todo/tool-todo/src/index.ts)

如果新文件导入 `@deepseek-ai/dsh-tools`，在 `scratch-plugin/tsconfig.json` 的 `references` 中增加：

```json
{
  "path": "../packages/core/tools"
}
```

然后构建依赖并检查练习项目：

```powershell
pnpm exec tsc -b scratch-plugin/tsconfig.json
pnpm exec tsc -p scratch-plugin/tsconfig.json --pretty false
```

### 验收

你应该能够解释为什么 Tool 插件依赖 `tools`，而 Tool Runtime 又依赖 `systemPrompt`：工具必须执行，同时工具 schema 也必须进入模型请求。

## 1:40–2:20：追踪一次完整 Agent Turn

### 只读一个核心文件

打开 [`packages/core/agent-loop/src/agent.ts`](../packages/core/agent-loop/src/agent.ts)，按以下顺序搜索方法，不要从第一行逐行阅读：

```text
send
wakeDriver
kick
turn
preStep
step
prepareRequest
buildRequest
```

把代码还原成下面的流程：

```text
用户消息
  → Inbox
  → turn/start
  → agent/pre-step
  → SystemPrompt.assemble
  → step/start
  → agent/request
  → LLM prepareCall + stream
  → assistant/message 或 assistant/attempt
  → tool/call + Tool Runtime + tool/result
  → step/end
  → turn/end
```

### 必须理解的三个事实

1. 一个 Turn 可以包含多个 Step。模型调用工具后，工具结果通常会触发下一次模型请求。
2. Session 日志是模型历史的事实源。`buildRequest()` 调用 `session.deriveMessages()`，而不是依赖一份临时聊天数组。
3. 实时流与持久化分离。`agent/assistant-stream` 服务 UI 实时展示；完整流结束后才写入 `assistant/message` 或 `assistant/attempt`。

继续查看：

- [`packages/core/agent-loop/src/tool-calls.ts`](../packages/core/agent-loop/src/tool-calls.ts)
- [`packages/core/session/src/index.ts`](../packages/core/session/src/index.ts)
- [`packages/core/tools/src/index.ts`](../packages/core/tools/src/index.ts)

不需要读完这些文件。只搜索：

```text
executeToolCalls
append(
deriveMessages
tools/pre-execute
tools/execute
tools/post-execute
```

### 验收题

不看文档回答：

- 为什么工具主体可以并行，但 `tool/result` 仍按模型顺序提交？
- 为什么模型可见的新上下文必须写入 SessionEvent？
- LLM 请求失败并重试时，为什么使用 `assistant/attempt` 而不是伪造一条正常消息？

## 2:20–2:45：掌握 Capability Seam

Harness 的可替换能力通常分成三种角色：

```text
Service Definition → Service Provider → Consumer
```

以文件系统为例：

```text
@deepseek-ai/dsh-fs
  → fs-local / fs-sandbox
  → tool-fs / tool-fs-search
```

阅读：

- [`docs/user/develop/practice/index.zh.md`](../docs/user/develop/practice/index.zh.md)
- [`packages/fs/README.md`](../packages/fs/README.md)
- [`packages/shell/README.md`](../packages/shell/README.md)

判断新需求进入哪一层：

| 需求 | 首选实现 |
|---|---|
| 给模型一套操作说明 | Skill 或 prompt section |
| 让模型执行一个动作 | Tool |
| 接入外部 SaaS 或数据源 | MCP |
| 观察或改变已有执行过程 | `agent/*`、`tools/*`、`fs/*` 事件 |
| 替换文件、进程、模型等实现 | Provider |
| 保存模型可见的长期事实 | SessionEvent + Projection |
| 组合已有能力 | Profile、Bundle 或 patch |
| 修改每一轮模型驱动规则 | 最后才考虑 Agent Loop |

## 2:45–3:00：接入完整 Harness

完整源码运行需要先生成仓库产物：

```powershell
Set-Location E:\deep\deepseek-harness
pnpm run build
```

首次构建会生成 package `lib/` 和 Web `dist/`。上一次出现大量 `failed to import`，是因为这些构建产物尚不存在，不是 `hello.ts` 加载失败；`hello.ts` 已经先打印了成功日志。

构建完成后，使用现有 Harness patch 启动：

```powershell
pnpm dsh web --patch ./scratch-plugin/cordis.yaml
```

成功标准：

- 终端打印 `hello from my first plugin`。
- 不再出现批量 `failed to import`。
- Web 服务启动并给出访问地址。
- 打开 Web UI 后可以创建 Session。

如果完整构建没有完成，不要反复运行 Web。先检查：

```powershell
Test-Path packages/core/agent-loop/lib/index.js
Test-Path packages/host/webserver/lib/index.js
Test-Path apps/web/dist/index.html
```

三个结果都应为 `True`。

## 三小时内暂时跳过

以下内容很重要，但不属于第一次训练：

- 55 个 Web Client 包的具体组件实现
- JSONL Session 历史版本迁移
- Typert 代码生成器内部实现
- Desktop 打包、签名和自动更新
- Python 单文件 Runtime 构建
- 全部 CI gate
- Experimental Agent Team
- Cordis Fiber 内部调度实现

## 最终自测

如果下面十题能独立回答八题以上，就已经具备继续开发个人 Harness 的基础：

1. `apply(ctx)` 在什么时候执行？
2. `inject` 为什么比 YAML 顺序可靠？
3. Effect 解决什么生命周期问题？
4. waterfall 监听器为什么必须调用 `next()`？
5. Profile、Bundle 和 patch 有什么区别？
6. Turn 和 Step 有什么区别？
7. 为什么 Session log 是模型历史的事实源？
8. Tool 的规范值和渲染内容为什么分离？
9. Provider 和 Consumer 为什么不应直接互相绑定？
10. 哪些需求才真正需要修改 Agent Loop？

完成后，下一项练习应该是把 `current_project` 工具挂入 Web，再开发一个只读的个人信息或系统状态工具。不要立即开发长期记忆或语音；先把工具、事件、Session 和权限链走通。
