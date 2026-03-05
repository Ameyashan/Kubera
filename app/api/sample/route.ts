import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateSampleData } from '@/lib/finance/sample-data'
import { buildDashboardPayload, type Transaction } from '@/lib/finance/dashboard'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Clear existing data
  await supabase.from('dashboard_cache').delete().eq('user_id', user.id)
  await supabase.from('transactions').delete().eq('user_id', user.id)

  // Generate and insert sample data
  const sampleTxns = generateSampleData()
  const rows = sampleTxns.map(t => ({
    user_id: user.id,
    date: t.date,
    description: t.description,
    amount: t.amount,
    card: t.card,
    category: t.category,
    account_type: t.account_type || 'credit_card',
    source_file: 'sample_data',
  }))

  // Insert in batches
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabase.from('transactions').insert(batch)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build and cache dashboard
  const transactions: Transaction[] = sampleTxns.map((t, i) => ({
    id: i + 1,
    date: t.date,
    description: t.description,
    amount: t.amount,
    card: t.card,
    category: t.category,
    account_type: t.account_type || 'credit_card',
  }))

  const payload = buildDashboardPayload(transactions)

  await supabase.from('dashboard_cache').upsert({
    user_id: user.id,
    payload,
    generated_at: new Date().toISOString(),
  })

  return NextResponse.json(payload)
}
