/** Expandable summary section shared by Trajectory inspector previews. */

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronRightOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './TrajectoryTable.module.css'

/**
 * Render a bounded inspector preview that opens its corresponding detail tab.
 * @param props - Localized heading, open action, optional controls, and preview content.
 * @returns A summary section that marks whether more content remains below the viewport.
 */
export function TrajectoryInspectorSection({
  label,
  onOpen,
  actions,
  children,
}: {
  label: string
  onOpen: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [hasMore, setHasMore] = useState(false)
  const measureOverflow = useCallback((preview: HTMLElement) => {
    setHasMore(preview.scrollHeight - preview.clientHeight - preview.scrollTop > 1)
  }, [])

  useLayoutEffect(() => {
    const preview = previewRef.current as HTMLDivElement
    const measure = () => { measureOverflow(preview) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(preview)
    for (const child of preview.children) observer.observe(child)
    return () => { observer.disconnect() }
  }, [children, measureOverflow])

  return (
    <section className={css.overviewSection}>
      <h3 className={css.overviewHeading}>
        <button
          type="button"
          className={css.overviewTitle}
          onClick={onOpen}
        >
          <span>{label}</span>
          <IconChevronRightOutline14 className={css.overviewTitleIcon} size={12} />
        </button>
        {actions}
      </h3>
      <div
        ref={previewRef}
        className={`${css.overviewPreview} ${css.summaryScrollRegion}`}
        data-summary-scroll-region=""
        data-scroll-more={hasMore || undefined}
        onScroll={(event) => { measureOverflow(event.currentTarget) }}
      >
        {children}
      </div>
    </section>
  )
}
