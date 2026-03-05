import Anthropic from '@anthropic-ai/sdk'
import { categorize } from './categorize'
import { detectAccountType } from './parsers'
import type { ParsedTransaction } from './parsers'

const SYSTEM_PROMPT = `You are a financial document parser. Extract every transaction from the bank or credit card statement text provided.

Return ONLY a JSON array of objects with these exact fields:
- "date": string in YYYY-MM-DD format. If the statement only shows MM/DD dates, infer the year from the statement period or header.
- "description": string — the merchant or transaction description, cleaned up (remove extra IDs, tracking numbers, and "Web ID" suffixes unless they are part of the merchant name).
- "amount": number — negative for debits/withdrawals/charges, positive for credits/deposits/income. Use the TRANSACTION amount, not the running balance.

Rules:
- Include ALL transactions: deposits, withdrawals, payments, fees, transfers.
- Do NOT include summary lines, totals, beginning/ending balances, or informational text.
- Do NOT include the running balance column — only the transaction amount.
- If a line has both a transaction amount and a running balance, the transaction amount comes first.
- For Apple Card statements: the last dollar amount on each transaction line is the transaction amount. Ignore the "Daily Cash" percentage and dollar columns. Do NOT include "Daily Cash" bonus lines as separate transactions.
- Return valid JSON only. No markdown fences, no explanation, no extra text.`

export async function parsePdfWithLLM(
  text: string,
  filename: string,
): Promise<ParsedTransaction[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [
      {
        role: 'user',
        content: `Extract all transactions from this bank/credit card statement:\n\n${text}`,
      },
    ],
    system: SYSTEM_PROMPT,
  })

  const stopReason = message.stop_reason
  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : ''

  if (stopReason === 'max_tokens') {
    console.warn(
      `LLM response was truncated (hit max_tokens). Response length: ${responseText.length} chars`,
    )
    throw new Error('LLM response truncated — output exceeded max_tokens')
  }

  const cleaned = responseText
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  let rawTransactions: Array<{
    date: string
    description: string
    amount: number
  }>

  try {
    rawTransactions = JSON.parse(cleaned)
  } catch {
    console.error('LLM returned invalid JSON:', cleaned.slice(0, 500))
    throw new Error('LLM returned invalid JSON')
  }

  if (!Array.isArray(rawTransactions)) {
    console.error('LLM response is not an array')
    throw new Error('LLM response is not an array')
  }

  const cardName = filename
    .replace(/\.(pdf|PDF)$/, '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
  const accountType = detectAccountType(filename)

  return rawTransactions
    .filter(
      (t) =>
        t.date &&
        t.description &&
        typeof t.amount === 'number' &&
        !isNaN(t.amount),
    )
    .map((t) => ({
      date: t.date,
      description: t.description.trim(),
      amount: Math.round(t.amount * 100) / 100,
      card: cardName,
      category: categorize(t.description),
      account_type: accountType,
    }))
}
