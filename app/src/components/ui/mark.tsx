// The Pexiz mark: an open door seen from inside the room. Traced from the
// designer's artwork (Pexis-07.png, 1624x2077) so it carries currentColor and
// stays sharp at nav size. The wordmark beside it lives in Logo.
import { cn } from "@/lib/cn"

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1624 2077" className={cn("size-5", className)} aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M880 42h636a28 28 0 0 1 28 28v1399a28 28 0 0 1-28 28H779L130 2016a28 28 0 0 1-66-20V310a28 28 0 0 1 12-23L866 47a28 28 0 0 1 14-5Z
           M1477 90h-177c-320 0-549 90-549 480v830a26 26 0 0 0 26 26h674a26 26 0 0 0 26-26V90Z"
      />
    </svg>
  )
}
