import Anthropic from '@anthropic-ai/sdk'
import { categorize } from './categorize'
import { detectAccountType } from './parsers'
import type { ParsedTransaction } from './parsers'

const CURRENT_YEAR = new Date().getFullYear()

const SYSTEM_PROMPT = `You are a financial document parser. Extract every transaction from the bank or credit card statement text provided.

Return ONLY a JSON array of objects with these exact fields:
- "date": string in YYYY-MM-DD format. CRITICAL year-inference rules:
  1. Look for the statement period or closing date in the document header (e.g. "Statement Period: January 1–31, 2026" or "Closing Date: 01/31/2026").
  2. Use that year for ALL transactions in the statement.
  3. If the statement spans a year boundary (e.g. a Dec–Jan billing cycle), assign each transaction the year that matches its month relative to the statement period.
  4. If no year is visible anywhere, default to ${CURRENT_YEAR}.
  5. Never assume 2024 or earlier for statements that appear recent.
- "description": string — the merchant or transaction description, cleaned up (remove extra IDs, tracking numbers, and "Web ID" suffixes unless they are part of the merchant name).
- "amount": number — negative for charges/purchases/withdrawals/debits/fees, positive for payments/credits/deposits/refunds/income. Use the TRANSACTION amount, not the running balance.

Rules:
- Include ALL transactions: deposits, withdrawals, payments, fees, transfers.
- Do NOT include summary lines, totals, beginning/ending balances, or informational text.
- Do NOT include the running balance column — only the transaction amount.
- If a line has both a transaction amount and a running balance, the transaction amount comes first.
- For Apple Card statements: purchases and fees are NEGATIVE (charges you owe). Payments toward your balance are POSITIVE. The last dollar amount on each transaction line is the transaction amount. Ignore the "Daily Cash" percentage and dollar columns. Do NOT include "Daily Cash" bonus lines as separate transactions.
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
