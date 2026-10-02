import { arch, availableParallelism, freemem, platform, release, totalmem, uptime } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'system-status'
export const inject = ['tools']

/** Format a byte count for the model-facing tool result. */
function formatBytes(bytes: number): string {
  const gibibytes = bytes / 1024 ** 3
  return `${gibibytes.toFixed(2)} GiB`
}

/** Register a read-only snapshot of the host and current Node.js process. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'system_status',
    description: 'Report current read-only operating system, CPU, memory, and process status.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          platform: { type: 'string', required: true },
          architecture: { type: 'string', required: true },
          osRelease: { type: 'string', required: true },
          cpuCount: { type: 'number', required: true },
          systemUptimeSeconds: { type: 'number', required: true },
          totalMemoryBytes: { type: 'number', required: true },
          freeMemoryBytes: { type: 'number', required: true },
          processUptimeSeconds: { type: 'number', required: true },
          processRssBytes: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `System: ${value.platform} ${value.architecture} (${value.osRelease})`,
          `Logical CPUs available: ${value.cpuCount}`,
          `Memory: ${formatBytes(value.freeMemoryBytes)} free of ${formatBytes(value.totalMemoryBytes)}`,
          `System uptime: ${Math.floor(value.systemUptimeSeconds)} seconds`,
          `Node.js process uptime: ${Math.floor(value.processUptimeSeconds)} seconds`,
          `Node.js process RSS: ${formatBytes(value.processRssBytes)}`,
        ].join('\n'),
      }],
      presentationMeta: (_args, value) => value,
    },
    async execute() {
      return {
        platform: platform(),
        architecture: arch(),
        osRelease: release(),
        cpuCount: availableParallelism(),
        systemUptimeSeconds: uptime(),
        totalMemoryBytes: totalmem(),
        freeMemoryBytes: freemem(),
        processUptimeSeconds: process.uptime(),
        processRssBytes: process.memoryUsage().rss,
      }
    },
  }))
}
