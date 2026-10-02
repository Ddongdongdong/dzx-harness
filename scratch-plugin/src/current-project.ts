import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'current-project'
export const inject = ['tools']

/** Register a read-only tool that reports the process hosting the harness. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'current_project',
    description: 'Report the current working directory, platform, and Node.js version.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cwd: { type: 'string', required: true },
          platform: { type: 'string', required: true },
          nodeVersion: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `Working directory: ${value.cwd}`,
          `Platform: ${value.platform}`,
          `Node.js: ${value.nodeVersion}`,
        ].join('\n'),
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute() {
      return {
        cwd: process.cwd(),
        platform: process.platform,
        nodeVersion: process.version,
      }
    },
  }))

  ctx.on('tools/result', (exec, result) => {
    console.log(`[current-project] ${exec.name} failed=${result.isError}`)
  })
}
