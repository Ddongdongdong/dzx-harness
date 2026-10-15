// @vitest-environment jsdom
/** Trajectory inspector tool-catalog presentation behavior. */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TrajectoryToolCatalog } from '../src/client/TrajectoryToolCatalog.tsx'
import { t } from './locale.client.ts'

afterEach(cleanup)

describe('TrajectoryToolCatalog', () => {
  it('renders expandable tool metadata and parameter schemas', () => {
    render(<TrajectoryToolCatalog
      tools={[{
        name: 'read',
        description: 'Read a file.',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
      }]}
      stringWrapping={undefined}
      t={t}
    />)

    expect(screen.getByText('read')).toBeDefined()
    expect(screen.getAllByText('Read a file.')).toHaveLength(2)
    expect(screen.getByLabelText('read parameters JSON')).toBeDefined()
  })

  it('renders the localized empty state', () => {
    render(<TrajectoryToolCatalog tools={[]} stringWrapping={undefined} t={t} />)

    expect(screen.getByText('No tools in this request')).toBeDefined()
  })
})
