import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseCsv, parsePdfText } from '@/lib/finance/parsers'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { filename, filetype, content } = await request.json()
    const buffer = Buffer.from(content, 'base64')

    let transactions: any[] = []

    if (filetype === 'csv') {
      const text = buffer.toString('utf-8')
      transactions = parseCsv(text, filename)
    } else {
      // PDF parsing
      try {
        const pdf = (await import('pdf-parse/lib/pdf-parse')).default
        const pdfData = await pdf(buffer)
        transactions = parsePdfText(pdfData.text, filename)
      } catch (pdfErr) {
        // Fallback: try raw text extraction
        const text = buffer.toString('latin1')
        const chunks = text.match(/\(([^)]+)\)/g)?.map(s => s.slice(1, -1)) || []
        transactions = parsePdfText(chunks.join('\n'), filename)
      }
    }

    // Insert transactions into Supabase
    if (transactions.length > 0) {
      const rows = transactions.map(t => ({
        user_id: user.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        card: t.card,
        category: t.category,
        source_file: filename,
      }))

      // Insert in batches of 500
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        const { error } = await supabase.from('transactions').insert(batch)
        if (error) {
          console.error('Insert error:', error)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
      }
    }

    // Clear dashboard cache so it regenerates
    await supabase.from('dashboard_cache').delete().eq('user_id', user.id)

    return NextResponse.json({
      status: 'ok',
      filename,
      transactions_found: transactions.length,
      sample: transactions.slice(0, 3),
    })
  } catch (err: any) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
