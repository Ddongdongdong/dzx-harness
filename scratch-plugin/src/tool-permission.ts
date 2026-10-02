import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'

export const name = 'tutorial-tool-permission'
export const inject = ['tools']

/** Tools that require a user decision before dispatch. */
export interface Config {
  protectedTools: string[]
}

/** Configuration for the tutorial's pre-execution policy. */
export const Config: z<Config> = z.object({
  protectedTools: z.array(String).default([]),
})

/** Require approval for configured tools while delegating every other call. */
export function apply(ctx: Context, config: Config): void {
  const protectedTools = new Set(config.protectedTools)

  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!protectedTools.has(exec.name)) return next()
    return {
      kind: 'ask',
      reason: `Allow ${exec.name} to read local runtime details?`,
    }
  })
}
