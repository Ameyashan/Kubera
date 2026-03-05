import { categorize } from './categorize'

export type AccountType = 'credit_card' | 'savings' | 'investment'

export interface ParsedTransaction {
  date: string
  description: string
  amount: number
  card: string
  category: string
  account_type: AccountType
}

export function detectAccountType(filename: string): AccountType {
  const lower = filename.toLowerCase()
  const investmentKeywords = [
    'fidelity', 'vanguard', 'schwab', 'etrade', 'e-trade', 'robinhood',
    'wealthfront', 'betterment', 'investment', 'brokerage', '401k', 'ira', 'roth',
    'portfolio', 'stock', 'fund', 'equity',
  ]
  const savingsKeywords = ['savings', 'checking', 'money market']

  if (investmentKeywords.some((k) => lower.includes(k))) return 'investment'
  if (savingsKeywords.some((k) => lower.includes(k))) return 'savings'
  return 'credit_card'
}

const DATE_FORMATS = [
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,    // MM/DD/YYYY
  /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,     // MM/DD/YY
  /^(\d{4})-(\d{2})-(\d{2})$/,           // YYYY-MM-DD
  /^(\d{1,2})-(\d{1,2})-(\d{4})$/,       // MM-DD-YYYY
]

export function tryParseDate(s: string): string | null {
  s = s.trim()
  
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00')
    if (!isNaN(d.getTime())) return s
  }
  
  // MM/DD/YYYY or MM/DD/YY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slashMatch) {
    let [, month, day, year] = slashMatch
    if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year
    const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`)
    if (!isNaN(d.getTime())) return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // MM-DD-YYYY
  const dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashMatch) {
    const [, month, day, year] = dashMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try native parse as last resort
  const d = new Date(s)
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
    return d.toISOString().substring(0, 10)
  }

  return null
}

export function parseCsv(text: string, filename: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return transactions

  // Simple CSV parsing (handles quoted fields)
  function parseLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  const header = parseLine(lines[0]).map(h => h.toLowerCase().replace(/"/g, ''))

  let dateCol: number | null = null
  let descCol: number | null = null
  let amountCol: number | null = null
  let debitCol: number | null = null
  let creditCol: number | null = null

  header.forEach((h, i) => {
    if (dateCol === null && ['date', 'trans date', 'transaction date', 'posting date', 'post date'].some(k => h.includes(k))) dateCol = i
    if (descCol === null && ['description', 'merchant', 'memo', 'narrative', 'details', 'name', 'payee'].some(k => h.includes(k))) descCol = i
    if (['amount', 'transaction amount', 'amt'].includes(h)) amountCol = i
    if (['debit', 'withdrawal'].includes(h)) debitCol = i
    if (['credit', 'deposit'].includes(h)) creditCol = i
  })

  if (dateCol === null) dateCol = 0
  if (descCol === null) descCol = header.length > 1 ? 1 : 0
  if (amountCol === null && debitCol === null) {
    for (let i = 0; i < header.length; i++) {
      if (i !== dateCol && i !== descCol) { amountCol = i; break }
    }
  }

  const cardName = filename.replace(/\.(csv|CSV)$/, '').replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  const accountType = detectAccountType(filename)

  for (let i = 1; i < lines.length; i++) {
    try {
      const row = parseLine(lines[i])
      if (row.length <= Math.max(dateCol || 0, descCol || 0, amountCol || 0, debitCol || 0, creditCol || 0)) continue

      const dateStr = row[dateCol!]?.trim()
      const desc = row[descCol!]?.trim()
      if (!dateStr || !desc) continue

      let amount: number
      if (amountCol !== null && row[amountCol]) {
        const amtStr = row[amountCol].replace(/[$,"]/g, '').trim()
        if (!amtStr || amtStr === '-') continue
        amount = parseFloat(amtStr)
      } else if (debitCol !== null) {
        const d = row[debitCol]?.replace(/[$,"]/g, '').trim()
        const c = creditCol !== null && row[creditCol] ? row[creditCol].replace(/[$,"]/g, '').trim() : '0'
        if (d && d !== '-' && d !== '') {
          amount = -Math.abs(parseFloat(d))
        } else if (c && c !== '-' && c !== '') {
          amount = Math.abs(parseFloat(c))
        } else continue
      } else continue

      if (isNaN(amount)) continue

      const parsedDate = tryParseDate(dateStr)
      if (!parsedDate) continue

      transactions.push({
        date: parsedDate,
        description: desc,
        amount: Math.round(amount * 100) / 100,
        card: cardName,
        category: categorize(desc),
        account_type: accountType,
      })
    } catch {
      continue
    }
  }

  return transactions
}

export function parsePdfText(text: string, filename: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []
  const cardName = filename.replace(/\.(pdf|PDF)$/, '').replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  const accountType = detectAccountType(filename)

  // Match lines: date [optional post date] description amount
  const pattern = /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+)?(.+?)\s+(-?\$?[\d,]+\.\d{2})\s*$/gm

  let match
  while ((match = pattern.exec(text)) !== null) {
    const dateStr = match[1]
    const desc = match[2].trim()
    const amtStr = match[3].replace(/[$,]/g, '')

    const parsedDate = tryParseDate(dateStr)
    if (!parsedDate) continue

    const amount = parseFloat(amtStr)
    if (isNaN(amount)) continue

    transactions.push({
      date: parsedDate,
      description: desc,
      amount: Math.round(amount * 100) / 100,
      card: cardName,
      category: categorize(desc),
      account_type: accountType,
    })
  }

  return transactions
}
