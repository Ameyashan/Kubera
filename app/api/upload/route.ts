import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseCsv, parsePdfText, type AccountType } from '@/lib/finance/parsers'
import { parsePdfWithLLM } from '@/lib/finance/llm-parser'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { filename, filetype, content, accountType, replace } = await request.json()
    const buffer = Buffer.from(content, 'base64')
    const overrideType = accountType as AccountType | undefined

    // If replacing (account type changed), delete existing transactions for this file
    if (replace) {
      await supabase
        .from('transactions')
        .delete()
        .eq('user_id', user.id)
        .eq('source_file', filename)
    }

    let transactions: any[] = []

    if (filetype === 'csv') {
      const text = buffer.toString('utf-8')
      transactions = parseCsv(text, filename)
    } else {
      let pdfText = ''

      try {
        const pdf = (await import('pdf-parse/lib/pdf-parse')).default
        const pdfData = await pdf(buffer)
        pdfText = pdfData.text
        console.log(`pdf-parse extracted ${pdfText.length} chars from ${filename}`)
      } catch (pdfErr: any) {
        console.warn(`pdf-parse failed for ${filename}: ${pdfErr.message}, using raw fallback`)
        const raw = buffer.toString('latin1')
        const chunks = raw.match(/\(([^)]+)\)/g)?.map(s => s.slice(1, -1)) || []
        pdfText = chunks.join('\n')
        console.log(`Raw fallback extracted ${pdfText.length} chars from ${filename}`)
      }

      if (pdfText.trim()) {
        try {
          transactions = await parsePdfWithLLM(pdfText, filename)
        } catch (llmErr: any) {
          console.warn(`LLM parsing failed for ${filename}: ${llmErr.message}, falling back to regex`)
          transactions = parsePdfText(pdfText, filename)
        }

        if (transactions.length === 0) {
          console.warn(`LLM returned 0 transactions for ${filename}, trying regex fallback`)
          const regexResult = parsePdfText(pdfText, filename)
          if (regexResult.length > 0) {
            console.log(`Regex fallback found ${regexResult.length} transactions for ${filename}`)
            transactions = regexResult
          }
        }
      } else {
        console.warn(`No text extracted from PDF ${filename} (pdf-parse and fallback both empty)`)
      }
    }

    // Insert transactions into Supabase
    if (transactions.length > 0) {
      const rows = transactions.map((t: any) => ({
        user_id: user.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        card: t.card,
        category: t.category,
        account_type: overrideType || t.account_type || 'credit_card',
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
