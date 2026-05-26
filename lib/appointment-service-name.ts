/** Party size is encoded in appointments.service_name: "Guest · Party of N · …" */
const SERVICE_NAME_SEP = ' \u00b7 '

export function parsePartySizeFromServiceName(serviceName: string | null | undefined): number | null {
  const parts = (serviceName ?? '').split(SERVICE_NAME_SEP)
  const partyPart = parts[1]?.trim()
  if (!partyPart) return null
  const n = parseInt(partyPart.replace(/\D/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}
