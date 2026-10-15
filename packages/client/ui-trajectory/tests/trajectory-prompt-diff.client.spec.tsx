// @vitest-environment jsdom
/** Trajectory inspector prompt-diff presentation behavior. */

import { cleanup, render, screen } from '@testing-library/react'
import type { ConversationPromptSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { afterEach, describe, expect, it } from 'vitest'
import { SystemPromptDiff } from '../src/client/TrajectoryPromptDiff.tsx'
import { t } from './locale.client.ts'

const CONFIG: ConversationPromptSnapshot['config'] = {
  provider: 'deepseek',
  model: 'deepseek-chat',
}

function snapshot(
  system: string,
  tools: ConversationPromptSnapshot['tools'],
): ConversationPromptSnapshot {
  return { config: CONFIG, system, tools }
}

afterEach(cleanup)

describe('SystemPromptDiff', () => {
  it('renders localized system-prompt and tool-catalog changes', () => {
    const before = snapshot('Keep answers brief.', [{
      name: 'read',
      description: 'Read a file.',
      parameters: { type: 'object' },
    }])
    const after = snapshot('Keep answers precise.', [{
      name: 'write',
      description: 'Write a file.',
      parameters: { type: 'object' },
    }])

    render(<SystemPromptDiff before={before} after={after} t={t} />)

    expect(screen.getByRole('heading', { name: 'System Prompt' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Tools' })).toBeDefined()
    expect(screen.getByText('-Keep answers brief.')).toBeDefined()
    expect(screen.getByText('+Keep answers precise.')).toBeDefined()
    expect(screen.getByText(/-\s+"name": "read"/)).toBeDefined()
    expect(screen.getByText(/\+\s+"name": "write"/)).toBeDefined()
  })

  it('renders no sections when prompt inputs are unchanged', () => {
    const prompt = snapshot('Keep answers brief.', [])
    const { container } = render(<SystemPromptDiff before={prompt} after={prompt} t={t} />)

    expect(container.querySelector('section')).toBeNull()
  })
})
