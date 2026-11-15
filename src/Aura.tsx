// the soft color glows behind every page. each glow is a blurry circle that drifts slowly
// (styles in index.css), and they all hold still when "reduce motion" is on
export default function Aura({ night = false }: { night?: boolean }) {
  return (
    <div className={night ? 'aura aura-night' : 'aura'} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  )
}
