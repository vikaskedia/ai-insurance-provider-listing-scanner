import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://sb.aiworkspace.pro'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU2MzE5NDAwLCJleHAiOjE5MTQwODU4MDB9.QS_GuMRWJ7SIjonrWVXGbYgeguj0C4XAJsyp_-fhhKE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function fetchScanResults(filters = {}) {
    let query = supabase
        .from('scan_results')
        .select('*')
        .order('scanned_at', { ascending: false })

    if (filters.insuranceId) query = query.eq('insurance_id', filters.insuranceId)
    if (filters.providerId) query = query.eq('provider_id', filters.providerId)
    if (filters.locationId) query = query.eq('location_id', filters.locationId)
    if (filters.status) query = query.eq('status', filters.status)

    const { data, error } = await query
    if (error) throw error
    return data || []
}
