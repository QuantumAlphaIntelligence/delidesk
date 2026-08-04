type Props = {
  className?: string
  title?: string
}

/** Marca DeliDesk: robozinho no computador (teal + mint). */
export function DeliDeskMark({
  className = 'w-10 h-10',
  title = 'DeliDesk'
}: Props): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <rect width="64" height="64" rx="16" fill="#0A2F3E" />
      {/* monitor / laptop base */}
      <rect x="10" y="28" width="44" height="26" rx="4" fill="#123D4F" stroke="#47F2C7" strokeWidth="1.5" />
      <rect x="14" y="32" width="36" height="16" rx="2" fill="#0D3C4F" />
      <rect x="22" y="50" width="20" height="3" rx="1.5" fill="#47F2C7" opacity="0.85" />
      {/* robot head */}
      <rect x="22" y="14" width="20" height="16" rx="5" fill="#47F2C7" />
      <circle cx="28.5" cy="21" r="2" fill="#0D3C4F" />
      <circle cx="35.5" cy="21" r="2" fill="#0D3C4F" />
      <path d="M28 25.5h8" stroke="#0D3C4F" strokeWidth="1.5" strokeLinecap="round" />
      {/* antennae */}
      <circle cx="26" cy="11" r="1.6" fill="#47F2C7" />
      <circle cx="38" cy="11" r="1.6" fill="#47F2C7" />
      <path d="M26 12.5V14M38 12.5V14" stroke="#47F2C7" strokeWidth="1.5" />
      {/* arms on keyboard */}
      <path
        d="M18 38c4 2 8 3 14 3s10-1 14-3"
        stroke="#47F2C7"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  )
}
