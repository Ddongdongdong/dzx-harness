---
description: "面向侧栏的官方 Arden 几何标志，仅在官方构建中生效；供选择或替换品牌呈现的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

## 概述

本包让以 `official` profile 构建的客户端在侧栏显示 Arden 几何标志。外壳在所有 profile 中提供本地化的 Arden 名称与副标题，Conversation 包提供配套的首屏标志。使用其他身份的部署可以提供替代标志包。本包不保留运行时状态，也不影响模型请求。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将本插件挂载到浏览器插件名单，然后以 `official` profile 构建客户端，让标志填充得以注册。

### 选择 profile

`DSH_CLIENT_BUILD_PROFILE` 决定标志提供方。`official` 构建使用本包的 Arden 标志；任何其他取值都保留侧栏的 Arden 回退。名称与副标题始终由侧栏提供本地化文本，Conversation 首屏在所有 profile 中保留自己的 Arden 回退。两种情况下插件都会加载；只有标志注册受 profile 门控。

### 替换品牌

自有身份的部署不组合本包，而是组合另一个占据 `sidebar.brand.mark` 的包；它也可以占据独立声明的侧栏名称与 Conversation 首屏标志 slot。占据 slot 是唯一的组合路径；这里不存在任何品牌配置面。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

标志填充通过 `ctx.slots.inject()` 等待侧栏声明，因此无论本行在声明者之前还是之后激活都能工作，并会在声明消失时撤回。浏览器半部是 [`src/client/index.ts`](src/client/index.ts)；node 半部是一个空 Loader 座位。浏览器标题是构建环境的事（`DSH_CLIENT_TITLE`），不在 slot 系统之内。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当品牌面不够用时阅读以下页面。它们从本包占据的 slot 进入渲染这些 slot 的外壳。

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明侧栏品牌 slot，并提供本地化的 Arden 名称与副标题。
- [ui-conversation](../ui-conversation/README.zh.md)——在首屏声明 `conversation.hero.brand.mark`。
- [Web 客户端架构](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——浏览器插件行如何加载并注册 slot。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了品牌呈现的供给方式。它们是当前包约束，不是品牌设计对比或任务积压。

- **只有一组填充**——替代呈现属于占据相同 slot 的另一个 Cordis 包。
- **浏览器标题独立**——`DSH_CLIENT_TITLE` 在构建时选择标题文本，而非通过 UI slot。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。本包不保留可变状态，标志 occupant 通过一个 effect 安装和释放。
