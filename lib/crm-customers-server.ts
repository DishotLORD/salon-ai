import { mapDbCustomerBase } from '@/lib/crm-customer'
import type { CrmCustomer } from '@/lib/crm-customer'
import { enrichCrmCustomers, type CrmAppointmentRow } from '@/lib/crm-guest-metrics'
import { createClient } from '@/lib/supabase-server'

export type CrmCustomersPayload = {
  customers: CrmCustomer[]
  businessId: string | null
}

export async function loadCrmCustomersServer(): Promise<CrmCustomersPayload> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { customers: [], businessId: null }
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!biz?.id) {
    return { customers: [], businessId: null }
  }

  const [customersRes, appointmentsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('business_id', biz.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('appointments')
      .select('customer_id, scheduled_at, status, service_name')
      .eq('business_id', biz.id),
  ])

  if (customersRes.error) {
    return { customers: [], businessId: biz.id }
  }

  const bases = (customersRes.data ?? []).map((r) =>
    mapDbCustomerBase(r as Record<string, unknown>),
  )
  const appointments = (appointmentsRes.data ?? []) as CrmAppointmentRow[]

  return {
    businessId: biz.id,
    customers: enrichCrmCustomers(bases, appointments),
  }
}
