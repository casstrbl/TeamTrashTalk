// the app logo: a bin that fills up green, then yellow, then red (logo b in figma).
// `outline` is the bin's line color: white on the dark login screen, pine on light pages
export default function BinLogo({ size = 48, outline = '#FFFFFF', glow = false, className = '' }: {
  size?: number
  outline?: string
  glow?: boolean // soft lime glow, used on the dark login screen
  className?: string
}) {
  // lime reads on the dark login screen; on light pages it fades into the ivory, so olive there
  const green = outline === '#FFFFFF' ? '#D3EDA1' : '#798F53'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Bin Monitor"
      className={className}
      style={glow ? { filter: 'drop-shadow(0 0 10px rgb(211 237 161 / 0.45))' } : undefined}
    >
      <path d="M9 12.5H39" stroke={outline} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M19 12.5V10a1.8 1.8 0 0 1 1.8-1.8h6.4A1.8 1.8 0 0 1 29 10v2.5" stroke={outline} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M12 16.5 14 38.6Q14.3 41.5 17.2 41.5H30.8Q33.7 41.5 34 38.6L36 16.5" stroke={outline} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      <rect x="15.6" y="19.5" width="16.8" height="5.4" rx="1.6" fill="#C88582" />
      <rect x="16.1" y="26.4" width="15.8" height="5.4" rx="1.6" fill="#D9A441" />
      <path d="M16.7 33.3H31.3L30.9 37.6Q30.7 38.8 29.5 38.8H18.5Q17.3 38.8 17.1 37.6Z" fill={green} />
    </svg>
  )
}
