---
description: "Official Arden geometric mark for the sidebar, active only in official builds; for users and maintainers choosing or replacing brand presentation."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

English | [中文](README.zh.md)

## Summary

This package gives an `official` client build the Arden geometric mark in the sidebar. The shell supplies the localized Arden name and tagline in every profile, and the Conversation package supplies the matching hero mark. Deployments with another identity can provide a replacement mark package. This package has no runtime state and does not affect model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in the browser roster, then build the client with the `official` profile so the mark occupant registers.

### Choosing the profile

`DSH_CLIENT_BUILD_PROFILE` selects the mark provider. An `official` build uses this package's Arden mark; any other value leaves the sidebar's Arden fallback in place. The localized name and tagline remain owned by the sidebar, and the Conversation hero keeps its own Arden fallback in every profile. The plugin loads in both cases; only the mark registration is profile-gated.

### Replacing the brand

A deployment with its own identity leaves this package out and composes another package that occupies `sidebar.brand.mark`. It may also occupy the independently declared sidebar name and Conversation hero mark slots. Slot occupation is the only composition route; there is no brand configuration surface here.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The mark occupant waits on the sidebar declaration through `ctx.slots.inject()`, so it works whether this row activates before or after the declarer and withdraws when the declaration collapses. The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat. The browser title is a build-environment concern (`DSH_CLIENT_TITLE`), outside the slot system.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the brand surface is not enough. They move from the slots this package occupies to the shell that renders them.

- [ui-sidebar](../ui-sidebar/README.md) — declares the sidebar brand slots and owns the localized Arden name and tagline.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` in the hero.
- [Web client architecture](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define how brand presentation is supplied. They are current package constraints, not a brand-design comparison or a task backlog.

- **One occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The package retains no mutable state, and its mark occupant installs and leaves through one effect.
