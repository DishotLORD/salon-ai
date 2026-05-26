import { CrmGuestsClient } from '@/app/dashboard/crm/crm-guests-client'
import { loadCrmCustomersServer } from '@/lib/crm-customers-server'

export default async function GuestsPage() {
  const { customers, businessId } = await loadCrmCustomersServer()

  return <CrmGuestsClient initialCustomers={customers} initialBusinessId={businessId} />
}
