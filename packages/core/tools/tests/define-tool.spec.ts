import { describe, expect, expectTypeOf, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, {
  defineContentToolFixture, defineTool, JsonSchemaError, parameterSchemaSpecToJsonSchema, validateArgs, ToolArgsError,
  type InferArgs, type ParameterSchemaSpec,
} from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

const testToolSignal = new AbortController().signal

async function setup() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  return ctx
}

const echoTool = defineTool({
  name: 'echo',
  description: 'echo arguments back',
  parameters: { text: { type: 'string' } },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute(args) {
    return args.text ?? ''
  },
})
describe('defineTool / schema DSL', () => {
  it('converts ParameterSchemaSpec to standard JSON Schema with required array', () => {
    const spec = {
      path: { type: 'string', required: true, description: 'Absolute path' },
      offset: { type: 'number' },
      limit: { type: 'number', description: 'Max lines' },
    } satisfies ParameterSchemaSpec
    const jsonSchema = parameterSchemaSpecToJsonSchema(spec)
    expect(jsonSchema).toEqual({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path' },
        offset: { type: 'number' },
        limit: { type: 'number', description: 'Max lines' },
      },
      required: ['path'],
    })
  })

  it('handles empty spec (no properties, no required)', () => {
    expect(parameterSchemaSpecToJsonSchema({})).toEqual({
      type: 'object',
      properties: {},
    })
  })

  it('handles nested object spec', () => {
    const spec = {
      config: {
        type: 'object',
        additionalProperties: true,
        required: true,
        properties: {
          host: { type: 'string', required: true },
          port: { type: 'number' },
        },
      },
    } satisfies ParameterSchemaSpec
    const jsonSchema = parameterSchemaSpecToJsonSchema(spec)
    expect(jsonSchema).toEqual({
      type: 'object',
      properties: {
        config: {
          type: 'object',
          additionalProperties: true,
          properties: {
            host: { type: 'string' },
            port: { type: 'number' },
          },
          required: ['host'],
        },
      },
      required: ['config'],
    })
  })

  it('defineTool returns a valid ToolDefinition with typed execute', async () => {
    const ctx = await setup()
    const tool = defineTool({
      name: 'typed-echo',
      description: 'A typed echo tool',
      parameters: {
        text: { type: 'string', required: true },
        uppercase: { type: 'boolean' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        // args is typed: { text: string; uppercase?: boolean }
        const result = args.uppercase ? args.text.toUpperCase() : args.text
        return result
      },
    })

    ctx.tools.register(tool)
    expect(ctx.tools.schemas()).toEqual([{
      name: 'typed-echo',
      description: 'A typed echo tool',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          uppercase: { type: 'boolean' },
        },
        required: ['text'],
      },
    }])

    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('c1'),
      name: 'typed-echo',
      arguments: { text: 'hello', uppercase: true },
    })
    expect(result.isError).toBe(false)
    expect(result.isError ? undefined : result.value).toBe('HELLO')
    expect(result.content).toEqual([{ type: 'text', text: 'HELLO' }])
  })

  it('type-level: InferArgs maps required properties to non-optional', () => {
    // Compile-time check: if this compiles, InferArgs is correct.
    // args.a is string (required), args.b is number|undefined (optional).
    const tool = defineTool({
      name: 'type-check',
      description: '',
      parameters: { a: { type: 'string' as const, required: true as const }, b: { type: 'number' as const } },
      output: { schema: { type: 'string' }, render: () => [] },
      async execute(args) {
        expect(typeof args.a).toBe('string')
        void args
        return args.a
      },
    })
    void tool
  })

  it('registry round-trips a defineTool definition (register→schemas→execute)', async () => {
    const ctx = await setup()
    ctx.tools.register(defineTool({
      name: 'roundtrip',
      description: 'Round-trip test',
      parameters: {
        req: { type: 'string', required: true },
        opt: { type: 'number', description: 'Optional number' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        return `${args.req}:${args.opt ?? 'none'}`
      },
    }))

    // Schema round-trip: schemas() returns standard JSON Schema
    const schemas = ctx.tools.schemas()
    expect(schemas).toHaveLength(1)
    expect(schemas[0]!.parameters).toEqual({
      type: 'object',
      properties: {
        req: { type: 'string' },
        opt: { type: 'number', description: 'Optional number' },
      },
      required: ['req'],
    })

    // Execution round-trip
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('c1'),
      name: 'roundtrip',
      arguments: { req: 'hello' },
    })
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'hello:none' }])
  })

  it('still accepts raw JSON-Schema ToolDefinition directly (MCP interop)', async () => {
    const ctx = await setup()
    ctx.tools.register({
      name: 'raw-tool',
      description: 'Raw JSON Schema tool (like an MCP adapter would register)',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value as string }],
      },
      async execute(args: unknown) {
        const p = args as { path: string }
        return p.path
      },
    })

    const schemas = ctx.tools.schemas()
    expect(schemas[0]!.parameters).toEqual({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    })

    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('c1'),
      name: 'raw-tool',
      arguments: { path: '/tmp' },
    })
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: '/tmp' }])
  })
})

describe('schema DSL edge cases', () => {
  it('emits enum values in JSON Schema property', () => {
    const spec = {
      color: { type: 'string', enum: ['red', 'green', 'blue'], description: 'Color choice' },
    } satisfies ParameterSchemaSpec
    const jsonSchema = parameterSchemaSpecToJsonSchema(spec)
    expect(jsonSchema.properties['color']).toMatchObject({
      type: 'string',
      enum: ['red', 'green', 'blue'],
      description: 'Color choice',
    })
  })

  it('emits default value in JSON Schema property', () => {
    const spec = {
      limit: { type: 'number', default: 25 },
    } satisfies ParameterSchemaSpec
    const jsonSchema = parameterSchemaSpecToJsonSchema(spec)
    expect(jsonSchema.properties['limit']).toMatchObject({
      type: 'number',
      default: 25,
    })
  })

  it('handles array items without nested properties (plain type array)', () => {
    const spec = {
      tags: { type: 'array', items: { type: 'string' } },
    } satisfies ParameterSchemaSpec
    const jsonSchema = parameterSchemaSpecToJsonSchema(spec)
    expect(jsonSchema.properties['tags']).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
  })

  it('handles enum and default together in one property', () => {
    const spec = {
      level: { type: 'string', enum: ['low', 'high'], default: 'low' },
    } satisfies ParameterSchemaSpec
    const jsonSchema = parameterSchemaSpecToJsonSchema(spec)
    expect(jsonSchema.properties['level']).toMatchObject({
      type: 'string',
      enum: ['low', 'high'],
      default: 'low',
    })
  })

  it('omits description, enum, default keys when not specified', () => {
    const spec = {
      bare: { type: 'string' },
    } satisfies ParameterSchemaSpec
    const jsonSchema = parameterSchemaSpecToJsonSchema(spec)
    const prop = jsonSchema.properties['bare'] as Record<string, unknown>
    expect(prop).toEqual({ type: 'string' })
    expect('description' in prop).toBe(false)
    expect('enum' in prop).toBe(false)
    expect('default' in prop).toBe(false)
  })

  it('handles array with no items (items omitted)', () => {
    const spec = {
      raw: { type: 'array' },
    } satisfies ParameterSchemaSpec
    const jsonSchema = parameterSchemaSpecToJsonSchema(spec)
    expect(jsonSchema.properties['raw']).toEqual({
      type: 'array',
    })
  })

  it('handles nested object with all-optional properties (no required array)', () => {
    const spec = {
      config: {
        type: 'object',
        additionalProperties: true,
        properties: {
          host: { type: 'string' },
          port: { type: 'number' },
        },
      },
    } satisfies ParameterSchemaSpec
    const jsonSchema = parameterSchemaSpecToJsonSchema(spec)
    expect(jsonSchema.properties['config']).toMatchObject({
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
      },
    })
    const config = jsonSchema.properties['config'] as Record<string, unknown>
    expect('required' in config).toBe(false)
  })
})

describe('schema DSL optional and nested contracts', () => {
  it('InferArgs makes non-required keys genuinely optional (omittable)', () => {
    type Args = InferArgs<{
      path: { type: 'string'; required: true }
      limit: { type: 'number' }
    }>
    expectTypeOf<Args>().toEqualTypeOf<{ path: string; limit?: number }>()
    const omitted: Args = { path: '/tmp' }
    expect(omitted.limit).toBeUndefined()
  })

  it('InferArgs recurses into array items, including arrays of objects', () => {
    type Args = InferArgs<{
      names: { type: 'array'; required: true; items: { type: 'string' } }
      servers: {
        type: 'array'
        items: {
          type: 'object'
          additionalProperties: true
          properties: {
            host: { type: 'string'; required: true }
            port: { type: 'number' }
          }
        }
      }
    }>
    expectTypeOf<Args>().toEqualTypeOf<{
      names: string[]
      servers?: ({ host: string; port?: number } & Record<string, JsonValue>)[]
    }>()
  })

  it('runtime JSON Schema matches the array-of-objects inference', () => {
    const spec = {
      servers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            host: { type: 'string', required: true },
            port: { type: 'number' },
          },
        },
      },
    } satisfies ParameterSchemaSpec
    expect(parameterSchemaSpecToJsonSchema(spec)).toEqual({
      type: 'object',
      properties: {
        servers: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              host: { type: 'string' },
              port: { type: 'number' },
            },
            required: ['host'],
          },
        },
      },
    })
  })

  it('reports messages from non-Error throws (throw { message })', async () => {
    const ctx = await setup()
    ctx.tools.register({
      ...echoTool,
      name: 'object-thrower',
      async execute() {
        // testing non-Error throws on purpose
        throw { message: 'denied by object' }
      },
    })
    const result = await ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId('c1'), name: 'object-thrower', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ text: 'Error: denied by object' })
  })

  it('reports messages from throws of non-objects (throw "string")', async () => {
    const ctx = await setup()
    ctx.tools.register({
      ...echoTool,
      name: 'string-thrower',
      async execute() {
        // testing primitive throws on purpose
        throw 'kaboom'
      },
    })
    const result = await ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId('c1'), name: 'string-thrower', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ text: 'Error: kaboom' })
  })

  it('reports messages from throws of objects without message property', async () => {
    const ctx = await setup()
    ctx.tools.register({
      ...echoTool,
      name: 'object-no-message',
      async execute() {
        // testing object throw without .message
        throw { code: 500 }
      },
    })
    const result = await ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId('c1'), name: 'object-no-message', arguments: {} })
    expect(result.isError).toBe(true)
    const firstContent = result.content[0]!
    expect(firstContent.type).toBe('text')
    if (firstContent.type === 'text') {
      expect(firstContent.text).toBe('Error: [object Object]')
    }
  })
})

describe('ToolRuntime.get', () => {
  it('get() returns the registered tool definition', async () => {
    const ctx = await setup()
    ctx.tools.register(echoTool)
    const tool = ctx.tools.get('echo')
    expect(tool).toBeDefined()
    expect(tool!.name).toBe('echo')
  })

  it('get() returns undefined for unknown tool names', async () => {
    const ctx = await setup()
    expect(ctx.tools.get('nope')).toBeUndefined()
  })
})

describe('validateArgs (the runtime-validation Agent Note, part 1)', () => {
  it('returns [] for valid args and is total over malformed input', () => {
    const spec = {
      path: { type: 'string', required: true },
      limit: { type: 'number' },
    } satisfies ParameterSchemaSpec
    expect(validateArgs(spec, { path: '/tmp' })).toEqual([])
    expect(validateArgs(spec, { path: '/tmp', limit: 5 })).toEqual([])
    // never throws regardless of shape
    expect(validateArgs(spec, null)).toHaveLength(1)
    expect(validateArgs(spec, 'nope')).toHaveLength(1)
    expect(validateArgs(spec, [])).toHaveLength(1)
  })

  it('flags a missing required key and a required key present as undefined', () => {
    const spec = { path: { type: 'string', required: true } } satisfies ParameterSchemaSpec
    expect(validateArgs(spec, {})).toEqual(['missing required property "path"'])
    expect(validateArgs(spec, { path: undefined })).toEqual(['missing required property "path"'])
  })

  it('allows extra keys (no additionalProperties:false) and omitted optionals', () => {
    const spec = { path: { type: 'string', required: true } } satisfies ParameterSchemaSpec
    expect(validateArgs(spec, { path: '/tmp', extra: 1 })).toEqual([])
  })

  it('does not apply defaults (validation only)', () => {
    const spec = { limit: { type: 'number', default: 25 } } satisfies ParameterSchemaSpec
    // absent optional is valid, and validation does not synthesize the default
    expect(validateArgs(spec, {})).toEqual([])
  })

  it('type-checks primitives', () => {
    const spec = {
      s: { type: 'string' },
      n: { type: 'number' },
      b: { type: 'boolean' },
    } satisfies ParameterSchemaSpec
    expect(validateArgs(spec, { s: 1 })).toEqual(['"s" must be a string'])
    expect(validateArgs(spec, { n: 'x' })).toEqual(['"n" must be a number'])
    expect(validateArgs(spec, { b: 'x' })).toEqual(['"b" must be a boolean'])
  })

  it('checks enum membership', () => {
    const spec = { color: { type: 'string', enum: ['red', 'green'] } } satisfies ParameterSchemaSpec
    expect(validateArgs(spec, { color: 'red' })).toEqual([])
    expect(validateArgs(spec, { color: 'blue' })).toEqual(['"color" must be one of ["red","green"]'])
  })

  it('enforces type-correct scalar enum declarations', () => {
    const spec = { n: { type: 'number', enum: [1, 2] } } satisfies ParameterSchemaSpec
    expect(validateArgs(spec, { n: 1 })).toEqual([])
    expect(validateArgs(spec, { n: 3 })).toEqual(['"n" must be one of [1,2]'])
    const invalid = { n: { type: 'number', enum: ['1', '2'] } } as unknown as ParameterSchemaSpec
    expect(() => validateArgs(invalid, { n: 1 })).toThrow(JsonSchemaError)
  })

  it('rejects an unknown schema type at the author boundary', () => {
    const spec = { x: { type: 'weird' } } as unknown as ParameterSchemaSpec
    expect(() => validateArgs(spec, { x: 1 })).toThrow(JsonSchemaError)
  })

  it('recurses into nested objects (and an object without properties only type-checks)', () => {
    const spec = {
      config: {
        type: 'object',
        additionalProperties: true,
        required: true,
        properties: { host: { type: 'string', required: true }, port: { type: 'number' } },
      },
      bag: { type: 'object', additionalProperties: true },
    } satisfies ParameterSchemaSpec
    expect(validateArgs(spec, { config: { host: 'h' }, bag: { anything: true } })).toEqual([])
    expect(validateArgs(spec, { config: { port: 9 }, bag: 5 })).toEqual([
      'missing required property "config.host"',
      '"bag" must be an object',
    ])
  })

  it('recurses into array items (and an array without items only type-checks)', () => {
    const spec = {
      tags: { type: 'array', items: { type: 'string' } },
      raw: { type: 'array' },
    } satisfies ParameterSchemaSpec
    expect(validateArgs(spec, { tags: ['a', 'b'], raw: [1, {}, 'x'] })).toEqual([])
    expect(validateArgs(spec, { tags: ['a', 2] })).toEqual(['"tags[1]" must be a string'])
    // a non-array value for an array-typed prop
    expect(validateArgs(spec, { tags: 'nope' })).toEqual(['"tags" must be an array'])
  })

  it('validates arrays of objects element-wise', () => {
    const spec = {
      servers: {
        type: 'array',
        items: { type: 'object', additionalProperties: true, properties: { host: { type: 'string', required: true } } },
      },
    } satisfies ParameterSchemaSpec
    expect(validateArgs(spec, { servers: [{ host: 'a' }, {}] })).toEqual([
      'missing required property "servers[1].host"',
    ])
  })
})

describe('defineTool validation (the runtime-validation Agent Note, part 1)', () => {
  it('returns an isError result with the violations when the model sends bad args', async () => {
    const ctx = await setup()
    ctx.tools.register(defineContentToolFixture({
      name: 'reader',
      description: 'reads a path',
      parameters: { path: { type: 'string', required: true } },
      async execute(args) {
        return [{ type: 'text', text: args.path }]
      },
    }))

    const result = await ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId('c1'), name: 'reader', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      text: 'Error: invalid arguments: missing required property "path"',
    })
  })

  it('runs execute normally when args are valid', async () => {
    const ctx = await setup()
    ctx.tools.register(defineContentToolFixture({
      name: 'reader',
      description: 'reads a path',
      parameters: { path: { type: 'string', required: true } },
      async execute(args) {
        return [{ type: 'text', text: `read ${args.path}` }]
      },
    }))
    const result = await ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId('c1'), name: 'reader', arguments: { path: '/x' } })
    expect(result).toEqual({
      content: [{ type: 'text', text: 'read /x' }],
      isError: false,
      value: [{ type: 'text', text: 'read /x' }],
    })
  })

  it('ToolArgsError carries a stable code and the violation list', () => {
    const err = new ToolArgsError(['missing required property "a"', '"b" must be a number'])
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ToolArgsError')
    expect(err.code).toBe('INVALID_ARGS')
    expect(err.violations).toEqual(['missing required property "a"', '"b" must be a number'])
    expect(err.message).toBe('invalid arguments: missing required property "a"; "b" must be a number')
  })

  it('a schema-invalid call surfaces the structured error on the result', async () => {
    const ctx = await setup()
    ctx.tools.register(defineContentToolFixture({
      name: 'reader',
      description: 'reads a path',
      parameters: { path: { type: 'string', required: true } },
      async execute(args) {
        return [{ type: 'text', text: args.path }]
      },
    }))
    const result = await ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId('c1'), name: 'reader', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.error).toEqual({
      message: 'invalid arguments: missing required property "path"',
      info: { name: 'ToolArgsError', code: 'INVALID_ARGS' },
    })
  })

  it('a tool throwing a HarnessError surfaces its name and code', async () => {
    const { HarnessError } = await import('@deepseek-ai/dsh-llm')
    const ctx = await setup()
    ctx.tools.register({
      ...echoTool,
      name: 'coded',
      async execute() {
        throw new HarnessError('disk full', 'ENOSPC')
      },
    })
    const result = await ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId('c1'), name: 'coded', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.error).toEqual({ message: 'disk full', info: { name: 'HarnessError', code: 'ENOSPC' } })
    expect(result.content[0]).toMatchObject({ text: 'Error: disk full' })
  })

  it('a non-HarnessError throw retains only its message', async () => {
    const ctx = await setup()
    ctx.tools.register({
      ...echoTool,
      name: 'plain',
      async execute() {
        throw new Error('just a message')
      },
    })
    const result = await ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId('c1'), name: 'plain', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.error).toEqual({ message: 'just a message' })
    expect(result.content[0]).toMatchObject({ text: 'Error: just a message' })
  })

  it('raw-registered tools are NOT validated by defineTool (MCP keeps its own)', async () => {
    const ctx = await setup()
    // A raw ToolDefinition: no defineTool wrapping, so no validateArgs guard.
    ctx.tools.register({
      name: 'raw',
      description: 'raw tool',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value as string }],
      },
      async execute(args: unknown) {
        return typeof args
      },
    })
    // Missing the "required" path — but raw tools validate their own input, so
    // this reaches execute rather than being rejected by the harness.
    const result = await ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId('c1'), name: 'raw', arguments: {} })
    expect(result.isError).toBe(false)
  })

  it('attaches a positive-finite timeoutMs to the definition', () => {
    const tool = defineContentToolFixture({
      name: 'x', description: 'd', parameters: {}, timeoutMs: 30_000,
      async execute() { return [{ type: 'text' as const, text: 'ok' }] },
    })
    expect(tool.timeoutMs).toBe(30_000)
  })

  it('omits timeoutMs when not declared', () => {
    const tool = defineContentToolFixture({
      name: 'x', description: 'd', parameters: {},
      async execute() { return [{ type: 'text' as const, text: 'ok' }] },
    })
    expect(tool.timeoutMs).toBeUndefined()
  })

  it('throws when timeoutMs is zero or negative', () => {
    const make = (ms: number) => defineContentToolFixture({
      name: 'x', description: 'd', parameters: {}, timeoutMs: ms,
      async execute() { return [{ type: 'text' as const, text: 'ok' }] },
    })
    expect(() => make(0)).toThrow('timeoutMs must be a positive finite number')
    expect(() => make(-5)).toThrow('positive finite number')
  })

  it('throws when timeoutMs is non-finite', () => {
    expect(() => defineContentToolFixture({
      name: 'x', description: 'd', parameters: {}, timeoutMs: Infinity,
      async execute() { return [{ type: 'text' as const, text: 'ok' }] },
    })).toThrow('positive finite number')
  })
})

describe('defineTool presentation (presentCall / presentResult)', () => {
  it('preserves inline enum and const literals in inferred arguments', () => {
    defineTool({
      name: 'literal-args',
      description: 'literal arguments',
      parameters: {
        mode: { type: 'string', enum: ['read', 'write'], required: true },
        attempt: { type: 'integer', const: 1 },
      },
      output: {
        schema: { type: 'null' },
        render: () => [],
      },
      async execute(args) {
        expectTypeOf(args).toEqualTypeOf<{ mode: 'read' | 'write'; attempt?: 1 }>()
        return null
      },
    })
  })

  it('threads presentCall/presentResult onto the ToolDefinition with typed args', () => {
    const tool = defineContentToolFixture({
      name: 'demo',
      description: 'demo',
      parameters: { path: { type: 'string', required: true }, n: { type: 'number' } },
      async execute() { return [{ type: 'text', text: 'ok' }] },
      presentCall(args) {
        // args is typed { path: string; n?: number } — zero casts.
        expectTypeOf(args).toEqualTypeOf<{ path: string; n?: number }>()
        return { card: 'generic', title: `Open ${args.path}`, kind: 'read', rawInput: args.path }
      },
      presentResult(args, result) {
        return { card: 'generic', title: `Opened ${args.path}`, content: result.content }
      },
    })
    expect(tool.presentCall!({ path: '/a', n: 2 })).toEqual({ card: 'generic', title: 'Open /a', kind: 'read', rawInput: '/a' })
    expect(tool.presentResult!({ path: '/a' }, { content: [{ type: 'text', text: 'x' }], isError: false }))
      .toEqual({ card: 'generic', title: 'Opened /a', content: [{ type: 'text', text: 'x' }] })
  })

  it('a tool without presentCall/presentResult leaves them undefined (UI falls back generically)', () => {
    const tool = defineContentToolFixture({
      name: 'plain',
      description: 'plain',
      parameters: { x: { type: 'string', required: true } },
      async execute() { return [] },
    })
    expect(typeof tool.presentCall).toBe('undefined')
    expect(typeof tool.presentResult).toBe('undefined')
  })

  it('presentCall/presentResult validate softly: malformed args return undefined, never throw (display runs on replay)', () => {
    const tool = defineContentToolFixture({
      name: 'demo',
      description: 'demo',
      parameters: { path: { type: 'string', required: true } },
      async execute() { return [] },
      presentCall: args => ({ card: 'generic', title: args.path }),
      presentResult: (args, result) => ({ card: 'generic', title: args.path, content: result.content }),
    })
    // Unlike execute (which throws ToolArgsError on a mismatch), the display
    // methods soft-validate and fall back to undefined so a UI never crashes
    // replaying an old/foreign log entry. The ToolDefinition methods take
    // `unknown`, so malformed shapes pass without a cast.
    expect(tool.presentCall?.({})).toBeUndefined()
    expect(tool.presentResult?.({ wrong: 1 }, { content: [], isError: false })).toBeUndefined()
  })
})
