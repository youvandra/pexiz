// Line icons for controls: one 16px grid, 1.5px stroke, round caps.
import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

export const Icon = {
  vault: <><rect x="2.5" y="3" width="11" height="10" rx="2.5" /><circle cx="8" cy="8" r="2" /><path d="M8 6v-.5M10 8h.5" /></>,
  monitor: <><path d="M1.8 8c1.6-2.9 3.7-4.3 6.2-4.3s4.6 1.4 6.2 4.3c-1.6 2.9-3.7 4.3-6.2 4.3S3.4 10.9 1.8 8Z" /><circle cx="8" cy="8" r="1.9" /></>,
  portfolio: <><path d="M2.5 5.5h11v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z" /><path d="M5.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" /></>,
  activity: <path d="M1.8 8h2.6l1.8-4.2 3.2 8.4 1.8-4.2h3" />,
  copy: <><rect x="5" y="5" width="8.5" height="8.5" rx="2" /><path d="M3 10.5V4a1.5 1.5 0 0 1 1.5-1.5H10" /></>,
  out: <><path d="M6 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h2" /><path d="m10 5 3 3-3 3M13 8H6" /></>,
  ext: <><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5" /><path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" /></>,
  drop: <path d="M8 2.2c2.4 3 3.8 5.1 3.8 6.8a3.8 3.8 0 0 1-7.6 0c0-1.7 1.4-3.8 3.8-6.8Z" />,
  check: <path d="m3.5 8.3 2.8 2.8 6.2-6.2" />,
  x: <path d="m4 4 8 8M12 4l-8 8" />,
  chevron: <path d="m4.5 6.2 3.5 3.5 3.5-3.5" />,
  wallet: <><rect x="2" y="4" width="12" height="9" rx="2" /><path d="M2 6.5h12M10.5 9.5h1" /></>,
  arrow: <path d="M3 8h9.5M8.5 4l4 4-4 4" />,
  arrowUpRight: <path d="M5 11 11 5M6 5h5v5" />,
  arrowDown: <path d="M8 3v9.5M4 8.5l4 4 4-4" />,
  deposit: <><path d="M8 2.5v7M5 6.5l3 3 3-3" /><path d="M2.5 10.5v1.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.5" /></>,
  withdraw: <><path d="M8 9.5v-7M5 5.5l3-3 3 3" /><path d="M2.5 10.5v1.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.5" /></>,
  book: <><path d="M2.5 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8a1.2 1.2 0 0 0-1.2-1.2H2.5Z" /><path d="M13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8a1.2 1.2 0 0 1 1.2-1.2h4.3Z" /></>,
  door: <><path d="M3.5 13.5v-10a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v10" /><path d="M2 13.5h12M8 8h.01M12.5 6v4" /></>,
  vote: <><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /><path d="m5.5 8.2 1.8 1.8 3.2-3.5" /></>,
  undo: <><path d="M5.5 4 2.5 7l3 3" /><path d="M2.5 7h7a4 4 0 0 1 0 8h-2" /></>,
  bell: <><path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11Z" /><path d="M6.5 14a1.6 1.6 0 0 0 3 0" /></>,
}

export function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}
