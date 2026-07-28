/** Party size is encoded in appointments.service_name: "Guest · Party of N · …" */

/**
 * Parse party size only from explicit segments like "Party of 4", "2 guests",
 * or "2 players". Never treat raw digits inside a resource name ("Pool Table 1")
 * as a guest count.
 */
export function parsePartySizeFromServiceName(serviceName: string | null | undefined): number | null {
  const parts = (serviceName ?? '')
    .split(/\s*\u00b7\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  for (const part of parts) {
    const partyOf = part.match(/^party of\s*(\d+)$/i)
    if (partyOf) {
      const n = parseInt(partyOf[1], 10)
      if (Number.isFinite(n) && n > 0 && n <= 30) return n
    }
    const guestsOrPlayers = part.match(/^(\d+)\s*(?:guests?|players?)$/i)
    if (guestsOrPlayers) {
      const n = parseInt(guestsOrPlayers[1], 10)
      if (Number.isFinite(n) && n > 0 && n <= 30) return n
    }
  }
  return null
}
