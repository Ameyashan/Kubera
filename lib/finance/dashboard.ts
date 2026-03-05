export interface Transaction {
  id?: number
  date: string
  description: string
  amount: number
  card: string
  category: string
}

export interface DashboardPayload {
  status: string
  summary: {
    total_spend: number
    total_income: number
    monthly_avg: number
    daily_avg: number
    total_interest: number
    total_transactions: number
    per_day_avg: number
    date_range: { start: string; end: string }
    num_months: number
    card_totals: Record<string, number>
    interest_by_card: Record<string, number>
  }
  monthly: {
    months: string[]
    by_card: Record<string, Record<string, number>>
    totals: Record<string, number>
  }
  categories: Record<string, number>
  category_trends: Record<string, Record<string, number>>
  top_merchants: Array<{ name: string; total: number; count: number }>
  interest: {
    total: number
    by_card: Record<string, number>
    monthly: Record<string, number>
  }
  balance: Record<string, Record<string, number>>
  dow: Array<{ day: string; total: number; avg: number; is_weekend: boolean }>
  insights: Array<{ title: string; value: string; detail: string; icon: string }>
  tips: Array<{ emoji: string; title: string; text: string; color: string }>
  transactions: Transaction[]
}

export function buildDashboardPayload(transactions: Transaction[]): DashboardPayload {
  const spending = transactions.filter(t => t.amount < 0)
  const income = transactions.filter(t => t.amount > 0)

  const totalSpend = spending.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const totalIncome = income.reduce((sum, t) => sum + t.amount, 0)

  const dates = transactions.map(t => t.date).filter(Boolean)
  const minDate = dates.length ? dates.sort()[0] : "N/A"
  const maxDate = dates.length ? dates.sort().reverse()[0] : "N/A"

  const monthsSet = new Set<string>()
  spending.forEach(t => { if (t.date) monthsSet.add(t.date.substring(0, 7)) })
  const numMonths = Math.max(monthsSet.size, 1)
  const monthlyAvg = totalSpend / numMonths

  let numDays = 1
  if (minDate !== "N/A" && maxDate !== "N/A") {
    numDays = Math.max(
      (new Date(maxDate).getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24),
      1
    )
  }
  const dailyAvg = totalSpend / numDays

  // Card totals
  const cards = new Set(spending.map(t => t.card))
  const cardTotals: Record<string, number> = {}
  cards.forEach(c => {
    cardTotals[c] = Math.round(spending.filter(t => t.card === c).reduce((s, t) => s + Math.abs(t.amount), 0) * 100) / 100
  })

  // Category breakdown
  const catTotals: Record<string, number> = {}
  spending.forEach(t => {
    catTotals[t.category] = (catTotals[t.category] || 0) + Math.abs(t.amount)
  })
  const sortedCatTotals = Object.fromEntries(
    Object.entries(catTotals).sort((a, b) => b[1] - a[1])
  )

  // Monthly spending by card
  const monthlyByCard: Record<string, Record<string, number>> = {}
  const monthlyTotal: Record<string, number> = {}
  spending.forEach(t => {
    if (!t.date) return
    const m = t.date.substring(0, 7)
    if (!monthlyByCard[t.card]) monthlyByCard[t.card] = {}
    monthlyByCard[t.card][m] = (monthlyByCard[t.card][m] || 0) + Math.abs(t.amount)
    monthlyTotal[m] = (monthlyTotal[m] || 0) + Math.abs(t.amount)
  })

  const sortedMonths = Array.from(monthsSet).sort()

  // Round monthly values
  for (const card of Object.keys(monthlyByCard)) {
    for (const m of Object.keys(monthlyByCard[card])) {
      monthlyByCard[card][m] = Math.round(monthlyByCard[card][m] * 100) / 100
    }
  }
  for (const m of Object.keys(monthlyTotal)) {
    monthlyTotal[m] = Math.round(monthlyTotal[m] * 100) / 100
  }

  // Category trends
  const catMonthly: Record<string, Record<string, number>> = {}
  spending.forEach(t => {
    if (!t.date) return
    const m = t.date.substring(0, 7)
    if (!catMonthly[t.category]) catMonthly[t.category] = {}
    catMonthly[t.category][m] = Math.round(((catMonthly[t.category][m] || 0) + Math.abs(t.amount)) * 100) / 100
  })

  // Top merchants
  const merchantTotals: Record<string, number> = {}
  const merchantCounts: Record<string, number> = {}
  spending.forEach(t => {
    merchantTotals[t.description] = (merchantTotals[t.description] || 0) + Math.abs(t.amount)
    merchantCounts[t.description] = (merchantCounts[t.description] || 0) + 1
  })
  const topMerchants = Object.entries(merchantTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, total]) => ({
      name,
      total: Math.round(total * 100) / 100,
      count: merchantCounts[name],
    }))

  // Day of week
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const dowSpend: Record<number, number> = {}
  const dowCount: Record<number, number> = {}
  spending.forEach(t => {
    if (!t.date) return
    const d = new Date(t.date + "T00:00:00")
    const dow = d.getDay()
    dowSpend[dow] = (dowSpend[dow] || 0) + Math.abs(t.amount)
    dowCount[dow] = (dowCount[dow] || 0) + 1
  })
  // Reorder: Mon-Sun
  const dowOrder = [1, 2, 3, 4, 5, 6, 0]
  const dowData = dowOrder.map(i => ({
    day: dayNames[i],
    total: Math.round((dowSpend[i] || 0) * 100) / 100,
    avg: Math.round((dowSpend[i] || 0) / Math.max(dowCount[i] || 1, 1) * 100) / 100,
    is_weekend: i === 0 || i === 6,
  }))

  // Interest charges
  const interestTxns = spending.filter(t =>
    ["interest", "finance charge", "interest charge"].some(k => t.description.toLowerCase().includes(k))
  )
  const totalInterest = Math.round(interestTxns.reduce((s, t) => s + Math.abs(t.amount), 0) * 100) / 100
  const interestByCard: Record<string, number> = {}
  const interestMonthly: Record<string, number> = {}
  interestTxns.forEach(t => {
    interestByCard[t.card] = Math.round(((interestByCard[t.card] || 0) + Math.abs(t.amount)) * 100) / 100
    if (t.date) {
      const m = t.date.substring(0, 7)
      interestMonthly[m] = Math.round(((interestMonthly[m] || 0) + Math.abs(t.amount)) * 100) / 100
    }
  })

  // Balance tracker
  const balanceByCard: Record<string, Record<string, number>> = {}
  const allCards = new Set(transactions.map(t => t.card))
  allCards.forEach(c => { balanceByCard[c] = {} })
  transactions.forEach(t => {
    if (!t.date) return
    const m = t.date.substring(0, 7)
    if (!balanceByCard[t.card]) balanceByCard[t.card] = {}
    balanceByCard[t.card][m] = Math.round(((balanceByCard[t.card][m] || 0) + t.amount) * 100) / 100
  })

  // Insights
  const monthlyTotalsList = sortedMonths.map(m => ({ month: m, total: monthlyTotal[m] || 0 }))
  const highestMonth = monthlyTotalsList.reduce((max, m) => m.total > max.total ? m : max, { month: "N/A", total: 0 })
  const lowestMonth = monthlyTotalsList.reduce((min, m) => m.total < min.total ? m : min, monthlyTotalsList[0] || { month: "N/A", total: 0 })
  const biggestTxn = spending.length ? spending.reduce((max, t) => Math.abs(t.amount) > Math.abs(max.amount) ? t : max) : null
  const mostFreq = Object.entries(merchantCounts).sort((a, b) => b[1] - a[1])[0] || ["N/A", 0]

  const weekendSpend = (dowSpend[0] || 0) + (dowSpend[6] || 0)
  const weekdaySpend = [1, 2, 3, 4, 5].reduce((s, i) => s + (dowSpend[i] || 0), 0)
  const diningShare = totalSpend > 0
    ? Math.round(((catTotals["Dining & Restaurants"] || 0) + (catTotals["Food Delivery"] || 0)) / totalSpend * 1000) / 10
    : 0

  const insights = [
    { title: "Highest Spending Month", value: `$${highestMonth.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, detail: highestMonth.month, icon: "📈" },
    { title: "Lowest Spending Month", value: `$${lowestMonth.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, detail: lowestMonth.month, icon: "📉" },
    { title: "Biggest Transaction", value: biggestTxn ? `$${Math.abs(biggestTxn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "N/A", detail: biggestTxn ? biggestTxn.description.substring(0, 40) : "", icon: "💰" },
    { title: "Most Frequent Merchant", value: `${mostFreq[1]} visits`, detail: String(mostFreq[0]).substring(0, 30), icon: "🔄" },
    { title: "Weekend vs Weekday", value: `$${weekendSpend.toLocaleString(undefined, { minimumFractionDigits: 0 })} / $${weekdaySpend.toLocaleString(undefined, { minimumFractionDigits: 0 })}`, detail: `Weekend avg $${Math.round(weekendSpend / Math.max((dowCount[0] || 0) + (dowCount[6] || 0), 1))}/day`, icon: "📅" },
    { title: "Dining Share", value: `${diningShare}%`, detail: "of total spending on food & delivery", icon: "🍽️" },
  ]

  // Tips
  const tips = generateTips(sortedCatTotals, totalSpend, diningShare, totalInterest, monthlyAvg, weekendSpend, weekdaySpend)

  return {
    status: "ready",
    summary: {
      total_spend: Math.round(totalSpend * 100) / 100,
      total_income: Math.round(totalIncome * 100) / 100,
      monthly_avg: Math.round(monthlyAvg * 100) / 100,
      daily_avg: Math.round(dailyAvg * 100) / 100,
      total_interest: totalInterest,
      total_transactions: spending.length,
      per_day_avg: Math.round(spending.length / numDays * 10) / 10,
      date_range: { start: minDate, end: maxDate },
      num_months: numMonths,
      card_totals: cardTotals,
      interest_by_card: interestByCard,
    },
    monthly: {
      months: sortedMonths,
      by_card: monthlyByCard,
      totals: monthlyTotal,
    },
    categories: Object.fromEntries(Object.entries(sortedCatTotals).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    category_trends: catMonthly,
    top_merchants: topMerchants,
    interest: {
      total: totalInterest,
      by_card: interestByCard,
      monthly: Object.fromEntries(sortedMonths.map(m => [m, interestMonthly[m] || 0])),
    },
    balance: balanceByCard,
    dow: dowData,
    insights,
    tips,
    transactions,
  }
}

function generateTips(
  catTotals: Record<string, number>,
  totalSpend: number,
  diningShare: number,
  totalInterest: number,
  monthlyAvg: number,
  weekendSpend: number,
  weekdaySpend: number
) {
  const tips: Array<{ emoji: string; title: string; text: string; color: string }> = []

  if (diningShare > 20) {
    tips.push({
      emoji: "🍳",
      title: "Cook More at Home",
      text: `Dining & delivery is ${diningShare}% of your spending. Cutting it by a third could save ~$${Math.round(totalSpend * diningShare / 100 / 3).toLocaleString()}.`,
      color: "#f59e0b",
    })
  }

  if (totalInterest > 0) {
    tips.push({
      emoji: "💳",
      title: "Eliminate Interest Charges",
      text: `You're paying $${totalInterest.toLocaleString(undefined, { minimumFractionDigits: 2 })} in interest. At 7% annual return, this money could grow to $${(totalInterest * 1.07).toLocaleString(undefined, { minimumFractionDigits: 2 })} in a year if invested instead.`,
      color: "#ef4444",
    })
  }

  const subs = catTotals["Subscriptions & Software"] || 0
  if (subs > 50) {
    tips.push({
      emoji: "🔄",
      title: "Audit Subscriptions",
      text: `$${subs.toLocaleString(undefined, { minimumFractionDigits: 2 })} on subscriptions. Review each one — cancel unused services to free up cash flow.`,
      color: "#a78bfa",
    })
  }

  const rideshare = catTotals["Ride-sharing & Taxis"] || 0
  if (rideshare > 100) {
    tips.push({
      emoji: "🚇",
      title: "Switch to Public Transit",
      text: `$${rideshare.toLocaleString(undefined, { minimumFractionDigits: 2 })} on ride-sharing. A monthly transit pass could cut this by 70%+.`,
      color: "#4f8ff7",
    })
  }

  const shopping = catTotals["Shopping"] || 0
  if (shopping > 200) {
    tips.push({
      emoji: "🛒",
      title: "Implement a 48-Hour Rule",
      text: `$${shopping.toLocaleString(undefined, { minimumFractionDigits: 2 })} on shopping. Wait 48 hours before non-essential purchases to reduce impulse buying.`,
      color: "#2dd4bf",
    })
  }

  if (weekendSpend > weekdaySpend * 0.5) {
    tips.push({
      emoji: "📅",
      title: "Plan Weekend Activities",
      text: "Weekend spending is high relative to weekdays. Plan free/low-cost weekend activities.",
      color: "#f472b6",
    })
  }

  tips.push({
    emoji: "📊",
    title: "Build an Emergency Fund",
    text: `Aim for 3-6 months of expenses ($${Math.round(monthlyAvg * 3).toLocaleString()}-$${Math.round(monthlyAvg * 6).toLocaleString()}). Automate transfers to a high-yield savings account.`,
    color: "#34d399",
  })

  tips.push({
    emoji: "🎯",
    title: "Set Category Budgets",
    text: "Assign monthly limits to your top 3 categories. Use the 50/30/20 rule: 50% needs, 30% wants, 20% savings.",
    color: "#22d3ee",
  })

  return tips.slice(0, 6)
}
