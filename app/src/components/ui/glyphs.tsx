// Hand-drawn glyphs. Soft glossy fills in the brand washes, drawn for this
// product: a watching eye, a key ring, a signed proof, an open door.
import { useId } from "react"

type Props = { tint?: string; className?: string }

function Gloss({ id, tint }: { id: string; tint: string }) {
  return (
    <defs>
      <radialGradient id={`${id}-g`} cx="35%" cy="28%" r="80%">
        <stop offset="0" stopColor="#fff" stopOpacity=".95" />
        <stop offset=".28" stopColor={tint} stopOpacity=".95" />
        <stop offset="1" stopColor={tint} />
      </radialGradient>
      <filter id={`${id}-s`} x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor={tint} floodOpacity=".35" />
      </filter>
    </defs>
  )
}

export function EyeGlyph({ tint = "#3FB874", className }: Props) {
  const id = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <Gloss id={id} tint={tint} />
      <g filter={`url(#${id}-s)`}>
        <path d="M4 32c7-12 17-18 28-18s21 6 28 18c-7 12-17 18-28 18S11 44 4 32Z" fill={`url(#${id}-g)`} />
        <circle cx="32" cy="32" r="10.5" fill="#fff" opacity=".92" />
        <circle cx="32" cy="32" r="5.5" fill="#0d0d0c" />
        <circle cx="29.6" cy="29.4" r="1.8" fill="#fff" />
      </g>
    </svg>
  )
}

export function KeysGlyph({ tint = "#E9C22E", className }: Props) {
  const id = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <Gloss id={id} tint={tint} />
      <g filter={`url(#${id}-s)`}>
        <circle cx="22" cy="24" r="13" fill={`url(#${id}-g)`} />
        <circle cx="22" cy="24" r="5" fill="#fffdf9" />
        <path d="M31 33 52 54m-7-7 5-5m-10 0 4-4" stroke={tint} strokeWidth="7" strokeLinecap="round" />
        <path d="M31 33 52 54" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  )
}

export function ProofGlyph({ tint = "#C564C4", className }: Props) {
  const id = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <Gloss id={id} tint={tint} />
      <g filter={`url(#${id}-s)`}>
        <rect x="12" y="6" width="40" height="50" rx="9" fill={`url(#${id}-g)`} />
        <path d="M21 20h22M21 28h16" stroke="#fff" strokeOpacity=".85" strokeWidth="4" strokeLinecap="round" />
        <circle cx="42" cy="44" r="10" fill="#fffdf9" />
        <path d="m37.5 44 3 3 6-6.5" stroke="#0d0d0c" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

export function DoorGlyph({ tint = "#F2772F", className }: Props) {
  const id = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <Gloss id={id} tint={tint} />
      <g filter={`url(#${id}-s)`}>
        <rect x="10" y="6" width="34" height="52" rx="8" fill={`url(#${id}-g)`} />
        <path d="M17 10.5 33 15v40l-16-3.5Z" fill="#fffdf9" opacity=".9" />
        <circle cx="28" cy="34" r="2.4" fill={tint} />
        <path d="M44 32h14m-5-6 6 6-6 6" stroke="#0d0d0c" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

export function BellGlyph({ tint = "#3FB874", className }: Props) {
  const id = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <Gloss id={id} tint={tint} />
      <g filter={`url(#${id}-s)`}>
        <path d="M32 8c-10 0-17 8-17 18v10l-5 8h44l-5-8V26C49 16 42 8 32 8Z" fill={`url(#${id}-g)`} />
        <circle cx="32" cy="50" r="6" fill="#0d0d0c" />
      </g>
    </svg>
  )
}
