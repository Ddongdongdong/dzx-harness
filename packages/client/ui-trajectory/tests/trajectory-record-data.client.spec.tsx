// @vitest-environment jsdom
/** Trajectory inspector source, payload, result, and schema presentation behavior. */

import { cleanup, render, screen } from '@testing-library/react'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { RenderMessageImages } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TrajectoryMessageSource, TrajectoryRecordPayload, TrajectoryRecordSchema,
} from '../src/client/TrajectoryRecordData.tsx'
import type { TrajectoryCellProps } from '../src/client/trajectory-record.ts'
import { t } from './locale.client.ts'

function cell(overrides: Partial<TrajectoryCellProps>): TrajectoryCellProps {
  return {
    index: 1,
    kind: 'tool',
    text: 'read',
    timeSeconds: 0.1,
    ...overrides,
  }
}

const renderImages: RenderMessageImages = ({ images }) => (
  <div data-testid="record-images" data-count={images.length} />
)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Trajectory record data', () => {
  it('renders recorded message sources and their localized empty state', () => {
    const view = render(
      <TrajectoryMessageSource
        cell={cell({ messageSource: 'external' })}
        stringWrapping={undefined}
        t={t}
      />,
    )

    expect(screen.getByLabelText(t('source.messageJson'))).toBeDefined()
    expect(screen.getByText('"external"')).toBeDefined()

    view.rerender(
      <TrajectoryMessageSource cell={cell({})} stringWrapping={undefined} t={t} />,
    )
    expect(screen.getByText(t('source.notRecorded'))).toBeDefined()
  })

  it('keeps generic input JSON and single-text result JSON distinct', () => {
    const view = render(
      <TrajectoryRecordPayload
        cell={cell({ inputDetail: '{"path":"README.md"}' })}
        direction="input"
        renderImages={renderImages}
        stringWrapping={undefined}
        t={t}
      />,
    )

    expect(screen.getByLabelText(t('record.payloadJson'))).toBeDefined()

    view.rerender(
      <TrajectoryRecordPayload
        cell={cell({
          outputDetail: '{"ok":true}',
          outputBlocks: [{ type: 'text', content: '{"ok":true}' }],
        })}
        direction="output"
        preview
        renderImages={renderImages}
        stringWrapping={undefined}
        t={t}
      />,
    )
    expect(screen.getByLabelText(t('record.resultJson'))).toBeDefined()
  })

  it('keeps text, images, and failure details in recorded output-block order', () => {
    const attachment = {
      attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
      mediaType: 'image/png' as const,
      bytes: 68,
      width: 320,
      height: 240,
      name: 'capture.png',
    }
    const renderImagesSpy = vi.fn<RenderMessageImages>(renderImages)

    const view = render(
      <TrajectoryRecordPayload
        cell={cell({
          outputDetail: 'ToolError: CAPTURE_FAILED',
          outputBlocks: [
            { type: 'text', content: 'partial output' },
            { type: 'image', content: '', attachment },
          ],
          isError: true,
        })}
        direction="output"
        renderImages={renderImagesSpy}
        stringWrapping={undefined}
        t={t}
      />,
    )

    expect(screen.getByText('ToolError: CAPTURE_FAILED')).toBeDefined()
    expect(screen.getByText('partial output')).toBeDefined()
    expect(screen.getByTestId('record-images').getAttribute('data-count')).toBe('1')
    expect(renderImagesSpy).toHaveBeenCalledWith({ images: [{ attachment }], align: 'start' })
    expect([...view.container.firstElementChild!.children].map(element => element.textContent))
      .toEqual(['ToolError: CAPTURE_FAILED', 'partial output', ''])
  })

  it('renders complete schemas structurally and preserves malformed or missing values', () => {
    const schema = JSON.stringify({
      name: 'read',
      description: 'Read a file.',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    })
    const view = render(
      <TrajectoryRecordSchema
        cell={cell({ schemaDetail: schema })}
        preview
        stringWrapping={undefined}
        t={t}
      />,
    )

    expect(screen.getByRole('heading', { name: 'read' })).toBeDefined()
    expect(screen.getByText('Read a file.')).toBeDefined()
    expect(screen.getByLabelText(t('record.namedParametersJson', { name: 'read' }))).toBeDefined()

    view.rerender(
      <TrajectoryRecordSchema
        cell={cell({ schemaDetail: 'not-json' })}
        stringWrapping={undefined}
        t={t}
      />,
    )
    expect(screen.getByText('not-json')).toBeDefined()

    view.rerender(
      <TrajectoryRecordSchema cell={cell({})} stringWrapping={undefined} t={t} />,
    )
    expect(screen.getByText(t('record.schemaUnavailable'))).toBeDefined()
  })
})
