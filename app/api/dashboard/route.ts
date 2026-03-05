import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildDashboardPayload, type Transaction } from '@/lib/finance/dashboard'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check cache first
  const { data: cached } = await supabase
    .from('dashboard_cache')
    .select('payload')
    .eq('user_id', user.id)
    .single()

  if (cached?.payload) {
    return NextResponse.json(cached.payload)
  }

  return NextResponse.json({ status: 'empty' })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch all transactions for this user
  const { data: rows, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) {
    return NextResponse.json({ status: 'empty', message: 'No transactions found.' })
  }

  const transactions: Transaction[] = rows.map(r => ({
    id: r.id,
    date: r.date,
    description: r.description,
    amount: Number(r.amount),
    card: r.card || 'Unknown',
    category: r.category || 'Other',
  }))

  const payload = buildDashboardPayload(transactions)

  // Cache the result
  await supabase.from('dashboard_cache').upsert({
    user_id: user.id,
    payload,
    generated_at: new Date().toISOString(),
  })

  return NextResponse.json(payload)
}
