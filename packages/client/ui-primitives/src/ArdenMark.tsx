/** Presentation options for the Arden geometric mark. */
export interface ArdenMarkProps {
  /** Square edge in CSS pixels. */
  size?: number
  /** Optional class applied to the SVG root. */
  className?: string
}

/**
 * Render the product's abstract geometric A as a lightweight inline SVG.
 * @param props - Size and optional host class.
 * @returns The monochrome Arden mark.
 */
export function ArdenMark({ size = 24, className }: ArdenMarkProps) {
  return (
    <svg
      {...(className === undefined ? {} : { className })}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 26.5 14.2 5.2 18.1 14 12.7 26.5H5Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
      <path d="M18.1 14 27 26.5h-8.7l-3.1-7.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.4 21.8h10" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  )
}
