// Product glyphs, drawn for Pexiz: flat duotone on a 64 grid, an ink outline
// at the same weight as the control icons and one brand wash per glyph.
// A watching eye, a key ring, a signed proof, an open door.

type Props = { tint?: string; className?: string }

const INK = "#0d0d0c"
const PAPER = "#fffdf9"
const line = { stroke: INK, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" } as const

export function EyeGlyph({ tint = "#3FB874", className }: Props) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M6 32c6.5-11 15.5-17 26-17s19.5 6 26 17c-6.5 11-15.5 17-26 17S12.5 43 6 32Z" fill={tint} {...line} />
      <circle cx="32" cy="32" r="10" fill={PAPER} {...line} />
      <circle cx="32" cy="32" r="4.5" fill={INK} />
    </svg>
  )
}

export function KeysGlyph({ tint = "#E9C22E", className }: Props) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="23" cy="24" r="13" fill={tint} {...line} />
      <circle cx="23" cy="24" r="4.5" fill={PAPER} {...line} />
      <path d="M32 33 54 55M46 47l5-5M40 41l4-4" fill="none" {...line} />
    </svg>
  )
}

export function ProofGlyph({ tint = "#C564C4", className }: Props) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect x="11" y="6" width="38" height="50" rx="7" fill={tint} {...line} />
      <path d="M20 19h20M20 28h13" fill="none" {...line} />
      <circle cx="44" cy="45" r="11" fill={PAPER} {...line} />
      <path d="m39 45 3.5 3.5L49 42" fill="none" {...line} />
    </svg>
  )
}

export function DoorGlyph({ tint = "#F2772F", className }: Props) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect x="8" y="7" width="32" height="50" rx="5" fill={PAPER} {...line} />
      <path d="M8 12.5 27 17v40H13a5 5 0 0 1-5-5Z" fill={tint} {...line} />
      <circle cx="22" cy="35" r="2.2" fill={INK} />
      <path d="M44 32h14m-5.5-5.5L58 32l-5.5 5.5" fill="none" {...line} />
    </svg>
  )
}
