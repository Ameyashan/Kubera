"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Chart } from 'chart.js/auto'
import { createClient } from '@/lib/supabase/client'

// ---- Chart.js Global Defaults ----
Chart.defaults.color = '#9ca3b4'
Chart.defaults.borderColor = '#2a2d3e'
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
Chart.defaults.animation = { duration: 1200, easing: 'easeOutQuart' } as never

const TOOLTIP_STYLE = {
  backgroundColor: '#1e2130',
  borderColor: '#3a3d5e',
  borderWidth: 1,
  titleColor: '#e8eaf0',
  bodyColor: '#9ca3b4',
  padding: 12,
  cornerRadius: 8,
  displayColors: true,
}

const ACCENT_COLORS = [
  '#4f8ff7', '#2dd4bf', '#f59e0b', '#ef4444', '#a78bfa',
  '#34d399', '#f472b6', '#22d3ee', '#fb923c', '#818cf8',
  '#fbbf24', '#6ee7b7',
]

// ---- Types ----
type AccountType = 'credit_card' | 'savings' | 'investment'

interface FileEntry {
  id: number
  name: string
  type: string
  status: 'uploading' | 'parsing' | 'ready' | 'error'
  file: File
  txCount: number
  accountType: AccountType
}

interface SavingsSummary {
  accounts: string[]
  total_deposits: number
  total_withdrawals: number
  net_cash_flow: number
  interest_earned: number
  monthly: {
    months: string[]
    deposits: Record<string, number>
    withdrawals: Record<string, number>
  }
  balance: Record<string, Record<string, number>>
}

interface InvestmentSummary {
  accounts: string[]
  total_contributions: number
  total_dividends: number
  monthly: {
    months: string[]
    contributions: Record<string, number>
    dividends: Record<string, number>
  }
}

interface DashboardPayload {
  status: string
  account_types: string[]
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
  interest: { total: number; by_card: Record<string, number>; monthly: Record<string, number> }
  balance: Record<string, Record<string, number>>
  dow: Array<{ day: string; total: number; avg: number; is_weekend: boolean }>
  insights: Array<{ title: string; value: string; detail: string; icon: string }>
  tips: Array<{ emoji: string; title: string; text: string; color: string }>
  transactions: Array<{
    id?: number
    date: string
    description: string
    amount: number
    card: string
    category: string
    account_type: AccountType
  }>
  savings: SavingsSummary | null
  investments: InvestmentSummary | null
}

function detectAccountTypeFromFilename(filename: string): AccountType {
  const lower = filename.toLowerCase()
  const investmentKeywords = ['fidelity', 'vanguard', 'schwab', 'etrade', 'e-trade', 'robinhood', 'wealthfront', 'betterment', 'investment', 'brokerage', '401k', 'ira', 'roth', 'portfolio', 'stock', 'fund']
  const savingsKeywords = ['savings', 'checking', 'money market']
  if (investmentKeywords.some((k) => lower.includes(k))) return 'investment'
  if (savingsKeywords.some((k) => lower.includes(k))) return 'savings'
  return 'credit_card'
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  credit_card: '💳 Credit Card',
  savings: '🏦 Savings / Checking',
  investment: '📈 Investment',
}

// ---- Helpers ----
function formatMonth(dateStr: string) {
  if (!dateStr || dateStr === 'N/A') return 'N/A'
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
  } catch {
    return dateStr
  }
}

function formatMonthShort(m: string) {
  try {
    const d = new Date(m + '-01T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  } catch {
    return m
  }
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function truncate(str: string, len: number) {
  if (!str) return ''
  return str.length > len ? str.substring(0, len) + '…' : str
}

function animNum(val: number, isCurrency = true) {
  if (isCurrency)
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return Math.round(val).toLocaleString()
}

// ---- Main Component ----
export default function HomePage() {
  const [view, setView] = useState<'upload' | 'dashboard'>('upload')
  const [uploadedFiles, setUploadedFiles] = useState<FileEntry[]>([])
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingText, setLoadingText] = useState('Checking your account for existing data…')
  const [isDragOver, setIsDragOver] = useState(false)
  const [txState, setTxState] = useState({
    sortCol: 'date',
    sortDir: 'desc' as 'asc' | 'desc',
    search: '',
    cardFilter: '',
    categoryFilter: '',
    monthFilter: '',
    accountTypeFilter: '',
    page: 1,
    perPage: 50,
  })

  // Chart refs
  const chartRefs = {
    chartMonthly: useRef<HTMLCanvasElement>(null),
    chartCategoryBar: useRef<HTMLCanvasElement>(null),
    chartCategoryDonut: useRef<HTMLCanvasElement>(null),
    chartCatTrend: useRef<HTMLCanvasElement>(null),
    chartMerchants: useRef<HTMLCanvasElement>(null),
    chartInterest: useRef<HTMLCanvasElement>(null),
    chartBalance: useRef<HTMLCanvasElement>(null),
    chartDow: useRef<HTMLCanvasElement>(null),
    chartSavingsMonthly: useRef<HTMLCanvasElement>(null),
    chartSavingsBalance: useRef<HTMLCanvasElement>(null),
    chartInvestmentsMonthly: useRef<HTMLCanvasElement>(null),
  }
  const chartInstances = useRef<Record<string, Chart>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---- On mount: check for existing dashboard data ----
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/dashboard')
        if (!res.ok) throw new Error('Failed to fetch dashboard')
        let data = await res.json()

        if (data.status === 'empty') {
          setLoadingText('Building your dashboard…')
          const rebuildRes = await fetch('/api/dashboard', { method: 'POST' })
          if (!rebuildRes.ok) throw new Error('Failed to rebuild dashboard')
          data = await rebuildRes.json()
        }

        if (data.status !== 'empty' && data.transactions && data.transactions.length > 0) {
          setDashboardData(data)
          setView('dashboard')
        }
      } catch (err) {
        console.error('Dashboard check error:', err)
      } finally {
        setLoading(false)
        setLoadingText('')
      }
    })()
  }, [])

  // ---- Chart rendering when dashboardData changes and in dashboard view ----
  useEffect(() => {
    if (!dashboardData || view !== 'dashboard') return

    // Small delay to allow canvas to render
    const timer = setTimeout(() => {
      renderAllCharts(dashboardData)
    }, 50)

    return () => {
      clearTimeout(timer)
      // Destroy all charts on cleanup
      Object.values(chartInstances.current).forEach((c) => c.destroy())
      chartInstances.current = {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardData, view])

  function destroyChart(id: string) {
    if (chartInstances.current[id]) {
      chartInstances.current[id].destroy()
      delete chartInstances.current[id]
    }
  }

  function renderAllCharts(d: DashboardPayload) {
    renderMonthlyChart(d)
    renderCategoryCharts(d)
    renderCategoryTrends(d)
    renderMerchantChart(d)
    renderInterestChart(d)
    renderBalanceChart(d)
    renderDowChart(d)
    if (d.savings) renderSavingsCharts(d.savings)
    if (d.investments) renderInvestmentsChart(d.investments)
  }

  // ---- Monthly Chart ----
  function renderMonthlyChart(d: DashboardPayload) {
    const canvas = chartRefs.chartMonthly.current
    if (!canvas) return
    destroyChart('chartMonthly')

    const months = d.monthly.months
    const labels = months.map(formatMonthShort)
    const cards = Object.keys(d.monthly.by_card)
    const cardColors = ['#4f8ff7', '#a78bfa', '#2dd4bf', '#f59e0b', '#ef4444']

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasets: any[] = cards.map((card, i) => ({
      label: card,
      data: months.map((m) => d.monthly.by_card[card][m] || 0),
      backgroundColor: cardColors[i % cardColors.length] + 'cc',
      borderColor: cardColors[i % cardColors.length],
      borderWidth: 1,
      borderRadius: 4,
      type: 'bar' as const,
    }))

    datasets.push({
      label: 'Total',
      data: months.map((m) => d.monthly.totals[m] || 0),
      type: 'line' as const,
      borderColor: '#e8eaf0',
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointBackgroundColor: '#e8eaf0',
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.3,
      order: -1,
    })

    chartInstances.current.chartMonthly = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: $${(ctx.parsed.y as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            },
          },
          legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            grid: { color: 'rgba(42,45,62,0.5)' },
            ticks: {
              callback: (v) => '$' + (Number(v) >= 1000 ? (Number(v) / 1000).toFixed(1) + 'k' : v),
              maxTicksLimit: 6,
            },
          },
        },
      },
    })
  }

  // ---- Category Charts ----
  function renderCategoryCharts(d: DashboardPayload) {
    const cats = Object.entries(d.categories)
    const labels = cats.map(([c]) => c)
    const values = cats.map(([, v]) => v)
    const colors = labels.map((_, i) => ACCENT_COLORS[i % ACCENT_COLORS.length])

    // Horizontal bar
    const barCanvas = chartRefs.chartCategoryBar.current
    if (barCanvas) {
      destroyChart('chartCategoryBar')
      chartInstances.current.chartCategoryBar = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors.map((c) => c + 'cc'),
              borderColor: colors,
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 1,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...TOOLTIP_STYLE,
              callbacks: {
                label: (ctx) =>
                  `$${(ctx.parsed.x as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(42,45,62,0.5)' },
              ticks: {
                callback: (v) => '$' + (Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v),
              },
            },
            y: {
              grid: { display: false },
              ticks: { font: { size: 11 } },
            },
          },
        },
      })
    }

    // Donut
    const donutCanvas = chartRefs.chartCategoryDonut.current
    if (donutCanvas) {
      destroyChart('chartCategoryDonut')
      chartInstances.current.chartCategoryDonut = new Chart(donutCanvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors.map((c) => c + 'cc'),
              borderColor: '#1e2130',
              borderWidth: 2,
              hoverBorderColor: '#e8eaf0',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 1,
          cutout: '55%',
          plugins: {
            legend: {
              position: 'right',
              labels: {
                boxWidth: 10,
                padding: 8,
                font: { size: 10 },
                generateLabels: function (chart) {
                  const data = chart.data
                  const total = (data.datasets[0].data as number[]).reduce((a, b) => a + b, 0)
                  return (data.labels as string[]).map((label, i) => ({
                    text: `${label} (${(((data.datasets[0].data[i] as number) / total) * 100).toFixed(1)}%)`,
                    fillStyle: (data.datasets[0].backgroundColor as string[])[i],
                    strokeStyle: data.datasets[0].borderColor as string,
                    lineWidth: 0,
                    index: i,
                    hidden: false,
                  }))
                },
              },
            },
            tooltip: {
              ...TOOLTIP_STYLE,
              callbacks: {
                label: (ctx) => {
                  const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0)
                  const pct = ((ctx.parsed / total) * 100).toFixed(1)
                  return `$${(ctx.parsed as number).toLocaleString(undefined, { minimumFractionDigits: 2 })} (${pct}%)`
                },
              },
            },
          },
        },
      })
    }
  }

  // ---- Category Trends ----
  function renderCategoryTrends(d: DashboardPayload) {
    const canvas = chartRefs.chartCatTrend.current
    if (!canvas) return
    destroyChart('chartCatTrend')

    const months = d.monthly.months
    const labels = months.map(formatMonthShort)
    const cats = Object.keys(d.category_trends).slice(0, 8)

    const datasets = cats.map((cat, i) => ({
      label: cat,
      data: months.map((m) => d.category_trends[cat][m] || 0),
      backgroundColor: ACCENT_COLORS[i % ACCENT_COLORS.length] + '33',
      borderColor: ACCENT_COLORS[i % ACCENT_COLORS.length],
      borderWidth: 1.5,
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 4,
    }))

    chartInstances.current.chartCatTrend = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: $${(ctx.parsed.y as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            },
          },
          legend: { position: 'top', labels: { boxWidth: 10, padding: 12, font: { size: 11 } } },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            stacked: true,
            grid: { color: 'rgba(42,45,62,0.5)' },
            ticks: {
              callback: (v) => '$' + (Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v),
            },
          },
        },
      },
    })
  }

  // ---- Top Merchants ----
  function renderMerchantChart(d: DashboardPayload) {
    const canvas = chartRefs.chartMerchants.current
    if (!canvas) return
    destroyChart('chartMerchants')

    const merchants = d.top_merchants
    const labels = merchants.map((m) => truncate(m.name, 30))
    const values = merchants.map((m) => m.total)

    const colors = merchants.map((_, i) => {
      const ratio = i / merchants.length
      const r = Math.round(79 + (239 - 79) * ratio)
      const g = Math.round(143 + (68 - 143) * ratio)
      const b = Math.round(247 + (68 - 247) * ratio)
      return `rgba(${r},${g},${b},0.8)`
    })

    chartInstances.current.chartMerchants = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderColor: colors.map((c) => c.replace('0.8', '1')),
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.5,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              title: (items) => d.top_merchants[items[0].dataIndex].name,
              label: (ctx) => {
                const m = d.top_merchants[ctx.dataIndex]
                return `$${m.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${m.count} transactions)`
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(42,45,62,0.5)' },
            ticks: {
              callback: (v) => '$' + (Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v),
            },
          },
          y: {
            grid: { display: false },
            ticks: { font: { size: 11 } },
          },
        },
      },
    })
  }

  // ---- Interest Chart ----
  function renderInterestChart(d: DashboardPayload) {
    const canvas = chartRefs.chartInterest.current
    if (!canvas) return
    destroyChart('chartInterest')

    const months = d.monthly.months
    const labels = months.map(formatMonthShort)
    const values = months.map((m) => d.interest.monthly[m] || 0)

    chartInstances.current.chartInterest = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Interest Charges',
            data: values,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239,68,68,0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#ef4444',
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (ctx) =>
                `Interest: $${(ctx.parsed.y as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: 'rgba(42,45,62,0.5)' },
            ticks: { callback: (v) => '$' + v },
          },
        },
      },
    })
  }

  // ---- Balance Chart ----
  function renderBalanceChart(d: DashboardPayload) {
    const canvas = chartRefs.chartBalance.current
    if (!canvas) return
    destroyChart('chartBalance')

    const months = d.monthly.months
    const labels = months.map(formatMonthShort)
    const cards = Object.keys(d.balance)
    const cardColors = ['#4f8ff7', '#a78bfa', '#2dd4bf', '#f59e0b']

    const datasets = cards.map((card, i) => {
      let cum = 0
      const data = months.map((m) => {
        cum += d.balance[card][m] || 0
        return Math.round(cum * 100) / 100
      })
      return {
        label: card,
        data,
        borderColor: cardColors[i % cardColors.length],
        backgroundColor: cardColors[i % cardColors.length] + '15',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
      }
    })

    chartInstances.current.chartBalance = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: $${(ctx.parsed.y as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            },
          },
          legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: 'rgba(42,45,62,0.5)' },
            ticks: {
              callback: (v) =>
                '$' + (Math.abs(Number(v)) >= 1000 ? (Number(v) / 1000).toFixed(1) + 'k' : v),
            },
          },
        },
      },
    })
  }

  // ---- Day of Week Chart ----
  function renderDowChart(d: DashboardPayload) {
    const canvas = chartRefs.chartDow.current
    if (!canvas) return
    destroyChart('chartDow')

    const dow = d.dow
    const labels = dow.map((day) => day.day)
    const values = dow.map((day) => day.total)
    const colors = dow.map((day) => (day.is_weekend ? '#f59e0b' + 'cc' : '#4f8ff7' + 'cc'))
    const borderColors = dow.map((day) => (day.is_weekend ? '#f59e0b' : '#4f8ff7'))

    chartInstances.current.chartDow = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Spend',
            data: values,
            backgroundColor: colors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (ctx) =>
                `Total: $${(ctx.parsed.y as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
              afterLabel: (ctx) => {
                const dayData = d.dow[ctx.dataIndex]
                return `Avg per ${dayData.day}: $${dayData.avg.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: 'rgba(42,45,62,0.5)' },
            ticks: {
              callback: (v) => '$' + (Number(v) >= 1000 ? (Number(v) / 1000).toFixed(0) + 'k' : v),
            },
          },
        },
      },
    })
  }

  // ---- Savings Charts ----
  function renderSavingsCharts(s: SavingsSummary) {
    const months = s.monthly.months
    const labels = months.map(formatMonthShort)

    // Monthly deposits vs withdrawals
    const monthlyCanvas = chartRefs.chartSavingsMonthly.current
    if (monthlyCanvas) {
      destroyChart('chartSavingsMonthly')
      chartInstances.current.chartSavingsMonthly = new Chart(monthlyCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Deposits',
              data: months.map((m) => s.monthly.deposits[m] || 0),
              backgroundColor: '#34d39999',
              borderColor: '#34d399',
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: 'Withdrawals',
              data: months.map((m) => s.monthly.withdrawals[m] || 0),
              backgroundColor: '#ef444499',
              borderColor: '#ef4444',
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2.5,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: { ...TOOLTIP_STYLE, callbacks: { label: (ctx) => `${ctx.dataset.label}: $${(ctx.parsed.y as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}` } },
            legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } },
          },
          scales: {
            x: { grid: { display: false } },
            y: { grid: { color: 'rgba(42,45,62,0.5)' }, ticks: { callback: (v) => '$' + (Number(v) >= 1000 ? (Number(v) / 1000).toFixed(1) + 'k' : v) } },
          },
        },
      })
    }

    // Cumulative balance per savings account
    const balanceCanvas = chartRefs.chartSavingsBalance.current
    if (balanceCanvas) {
      destroyChart('chartSavingsBalance')
      const savingsColors = ['#34d399', '#2dd4bf', '#22d3ee', '#a78bfa']
      const datasets = s.accounts.map((acct, i) => {
        let cum = 0
        const data = months.map((m) => {
          cum += s.balance[acct]?.[m] || 0
          return Math.round(cum * 100) / 100
        })
        return {
          label: acct,
          data,
          borderColor: savingsColors[i % savingsColors.length],
          backgroundColor: savingsColors[i % savingsColors.length] + '15',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        }
      })
      chartInstances.current.chartSavingsBalance = new Chart(balanceCanvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2.5,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: { ...TOOLTIP_STYLE, callbacks: { label: (ctx) => `${ctx.dataset.label}: $${(ctx.parsed.y as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}` } },
            legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } },
          },
          scales: {
            x: { grid: { display: false } },
            y: { grid: { color: 'rgba(42,45,62,0.5)' }, ticks: { callback: (v) => '$' + (Math.abs(Number(v)) >= 1000 ? (Number(v) / 1000).toFixed(1) + 'k' : v) } },
          },
        },
      })
    }
  }

  // ---- Investments Chart ----
  function renderInvestmentsChart(inv: InvestmentSummary) {
    const months = inv.monthly.months
    const labels = months.map(formatMonthShort)
    const canvas = chartRefs.chartInvestmentsMonthly.current
    if (!canvas) return
    destroyChart('chartInvestmentsMonthly')

    chartInstances.current.chartInvestmentsMonthly = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Contributions / Purchases',
            data: months.map((m) => inv.monthly.contributions[m] || 0),
            backgroundColor: '#f59e0b99',
            borderColor: '#f59e0b',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Dividends / Distributions',
            data: months.map((m) => inv.monthly.dividends[m] || 0),
            backgroundColor: '#4f8ff799',
            borderColor: '#4f8ff7',
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          tooltip: { ...TOOLTIP_STYLE, callbacks: { label: (ctx) => `${ctx.dataset.label}: $${(ctx.parsed.y as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}` } },
          legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(42,45,62,0.5)' }, ticks: { callback: (v) => '$' + (Number(v) >= 1000 ? (Number(v) / 1000).toFixed(1) + 'k' : v) } },
        },
      },
    })
  }

  // ---- File Handling ----
  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function uploadFile(fileObj: FileEntry, replace = false) {
    try {
      const base64 = await readFileAsBase64(fileObj.file)
      setUploadedFiles((prev) =>
        prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'parsing' } : f))
      )

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: fileObj.name,
          filetype: fileObj.type,
          content: base64,
          accountType: fileObj.accountType,
          replace,
        }),
      })

      const data = await res.json()
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === fileObj.id
            ? { ...f, status: 'ready', txCount: data.transactions_found || 0 }
            : f
        )
      )

      // Auto-regenerate dashboard after successful upload so new data is reflected immediately
      if (!data.error && (data.transactions_found || 0) > 0) {
        setLoading(true)
        setLoadingText('Updating your dashboard...')
        try {
          const dashRes = await fetch('/api/dashboard', { method: 'POST' })
          const dashData = await dashRes.json()
          if (dashData.status !== 'empty' && dashData.transactions) {
            setDashboardData(dashData)
            setView('dashboard')
          }
        } catch (dashErr) {
          console.error('Auto-generate dashboard error:', dashErr)
        } finally {
          setLoading(false)
        }
      }
    } catch (err) {
      console.error('Upload error:', err)
      setUploadedFiles((prev) =>
        prev.map((f) => (f.id === fileObj.id ? { ...f, status: 'error' } : f))
      )
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!['pdf', 'csv'].includes(ext || '')) {
        alert('Only PDF and CSV files are supported.')
        continue
      }
      const fileObj: FileEntry = {
        id: Date.now() + Math.random(),
        name: file.name,
        type: ext || '',
        status: 'uploading',
        file,
        txCount: 0,
        accountType: detectAccountTypeFromFilename(file.name),
      }
      setUploadedFiles((prev) => [...prev, fileObj])
      uploadFile(fileObj)
    }
  }

  async function handleAccountTypeChange(fileId: number, newType: AccountType) {
    setUploadedFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, accountType: newType } : f))
    )
    const fileObj = uploadedFiles.find((f) => f.id === fileId)
    if (fileObj && fileObj.status === 'ready') {
      setUploadedFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, accountType: newType, status: 'uploading' } : f))
      )
      await uploadFile({ ...fileObj, accountType: newType }, true)
    }
  }

  function removeFile(id: number) {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  // ---- Actions ----
  async function generateDashboard() {
    setLoading(true)
    setLoadingText('Processing your financial data...')
    try {
      const res = await fetch('/api/dashboard', { method: 'POST' })
      const data = await res.json()
      if (data.status === 'empty') {
        setLoading(false)
        alert('No transactions found in uploaded files.')
        return
      }
      setDashboardData(data)
      setView('dashboard')
    } catch (err) {
      console.error('Process error:', err)
      alert('Error processing data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function loadSampleData() {
    setLoading(true)
    setLoadingText('Generating sample financial data...')
    try {
      const res = await fetch('/api/sample', { method: 'POST' })
      const data = await res.json()
      setDashboardData(data)
      setView('dashboard')
    } catch (err) {
      console.error('Sample error:', err)
      alert('Error loading sample data.')
    } finally {
      setLoading(false)
    }
  }

  async function resetData() {
    try {
      await fetch('/api/reset', { method: 'DELETE' })
      setUploadedFiles([])
      setDashboardData(null)
      setView('upload')
    } catch (err) {
      console.error('Reset error:', err)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const hasReadyFiles = uploadedFiles.some((f) => f.status === 'ready')

  // ---- Transaction Table Computed Data ----
  const allTxns = useMemo(() => {
    if (!dashboardData) return []
    return dashboardData.transactions
  }, [dashboardData])

  const txCards = useMemo(() => [...new Set(allTxns.map((t) => t.card))].sort(), [allTxns])
  const txCategories = useMemo(
    () => [...new Set(allTxns.map((t) => t.category))].sort(),
    [allTxns]
  )
  const txMonths = useMemo(
    () => [...new Set(allTxns.map((t) => t.date.substring(0, 7)))].sort(),
    [allTxns]
  )

  const filteredTxns = useMemo(() => {
    let filtered = allTxns

    if (txState.search) {
      filtered = filtered.filter((t) =>
        t.description.toLowerCase().includes(txState.search.toLowerCase())
      )
    }
    if (txState.accountTypeFilter) {
      filtered = filtered.filter((t) => (t.account_type || 'credit_card') === txState.accountTypeFilter)
    }
    if (txState.cardFilter) {
      filtered = filtered.filter((t) => t.card === txState.cardFilter)
    }
    if (txState.categoryFilter) {
      filtered = filtered.filter((t) => t.category === txState.categoryFilter)
    }
    if (txState.monthFilter) {
      filtered = filtered.filter((t) => t.date.substring(0, 7) === txState.monthFilter)
    }

    filtered = [...filtered].sort((a, b) => {
      let va: string | number = a[txState.sortCol as keyof typeof a] as string | number
      let vb: string | number = b[txState.sortCol as keyof typeof b] as string | number
      if (txState.sortCol === 'amount') {
        va = Math.abs(va as number)
        vb = Math.abs(vb as number)
      }
      if (typeof va === 'string') {
        va = va.toLowerCase()
        vb = (vb as string).toLowerCase()
      }
      if (va < vb) return txState.sortDir === 'asc' ? -1 : 1
      if (va > vb) return txState.sortDir === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [allTxns, txState])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredTxns.length / txState.perPage)),
    [filteredTxns.length, txState.perPage]
  )

  const pagedTxns = useMemo(() => {
    const page = Math.min(txState.page, totalPages)
    const start = (page - 1) * txState.perPage
    return filteredTxns.slice(start, start + txState.perPage)
  }, [filteredTxns, txState.page, txState.perPage, totalPages])

  const txStart = useMemo(() => {
    const page = Math.min(txState.page, totalPages)
    return (page - 1) * txState.perPage
  }, [txState.page, txState.perPage, totalPages])

  function handleSort(col: string) {
    setTxState((prev) => ({
      ...prev,
      sortCol: col,
      sortDir: prev.sortCol === col ? (prev.sortDir === 'asc' ? 'desc' : 'asc') : col === 'amount' ? 'desc' : 'asc',
      page: 1,
    }))
  }

  function changeTxPage(page: number) {
    setTxState((prev) => ({ ...prev, page }))
    document.getElementById('sectionTransactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Pagination buttons
  const paginationPages = useMemo(() => {
    const maxBtns = 7
    const currentPage = Math.min(txState.page, totalPages)
    if (totalPages <= maxBtns) {
      return Array.from({ length: totalPages }, (_, i) => i + 1) as (number | '...')[]
    }
    const pages: (number | '...')[] = [1]
    const lo = Math.max(2, currentPage - 1)
    const hi = Math.min(totalPages - 1, currentPage + 1)
    if (lo > 2) pages.push('...')
    for (let i = lo; i <= hi; i++) pages.push(i)
    if (hi < totalPages - 1) pages.push('...')
    pages.push(totalPages)
    return pages
  }, [txState.page, totalPages])

  const currentPage = Math.min(txState.page, totalPages)

  // ---- Render ----
  return (
    <>
      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay active">
          <div className="loading-content">
            <div className="loading-spinner" />
            <div className="loading-text">{loadingText}</div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-inner">
          <div className="nav-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 28, height: 28 }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" strokeLinecap="round" />
              <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Personal CFO
          </div>
          <div className="nav-links" id="navLinks">
            {view === 'dashboard' && (
              <>
                <button className="nav-back-btn" onClick={() => setView('upload')}>
                  + Upload More Statements
                </button>
                <a href="#heroSection">Overview</a>
                <a href="#sectionMonthly">Cards</a>
                {dashboardData?.savings && <a href="#sectionSavings">Savings</a>}
                {dashboardData?.investments && <a href="#sectionInvestments">Investments</a>}
                <a href="#sectionInsights">Insights</a>
                <a href="#sectionTransactions">Transactions</a>
              </>
            )}
            <button className="btn-signout" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Upload View */}
      <div
        className={`upload-view ${view === 'upload' ? 'active' : ''}`}
        style={{ display: view === 'upload' ? 'flex' : 'none' }}
      >
        <div className="upload-container">
          <div className="upload-header">
            <h1>{dashboardData ? 'Add More Statements' : 'Your Personal CFO'}</h1>
            <p>
              {dashboardData
                ? 'Upload additional bank & credit card statements to enrich your dashboard'
                : 'Upload your bank & credit card statements to get started'}
            </p>
            {dashboardData && (
              <button
                className="btn btn-secondary"
                style={{ marginTop: 12 }}
                onClick={() => setView('dashboard')}
              >
                ← Back to Dashboard
              </button>
            )}
          </div>

          <div
            className={`drop-zone ${isDragOver ? 'dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragOver(false)
              handleFiles(e.dataTransfer.files)
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg
              className="drop-zone-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M12 16V4m0 0L8 8m4-4l4 4M2 17l.621 2.485A2 2 0 003.561 21h16.878a2 2 0 001.94-1.515L23 17"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h3>Drop your statements here</h3>
            <p>Supports CSV and PDF files from Chase, Apple Card, and more</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {uploadedFiles.length > 0 && (
            <div className="file-list">
              {uploadedFiles.map((f) => (
                <div className="file-item" key={f.id}>
                  <span className={`file-type-badge ${f.type}`}>{f.type}</span>
                  <span className="file-name">{f.name}</span>
                  <select
                    className="account-type-select"
                    value={f.accountType}
                    onChange={(e) => handleAccountTypeChange(f.id, e.target.value as AccountType)}
                    title="Account type — change if auto-detected incorrectly"
                  >
                    <option value="credit_card">💳 Credit Card</option>
                    <option value="savings">🏦 Savings / Checking</option>
                    <option value="investment">📈 Investment</option>
                  </select>
                  {f.txCount > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {f.txCount} txns
                    </span>
                  )}
                  <span className={`file-status ${f.status}`}>
                    {f.status === 'uploading' ? (
                      <><span className="spinner" /> Uploading</>
                    ) : f.status === 'parsing' ? (
                      <><span className="spinner" /> Parsing</>
                    ) : f.status === 'ready' ? (
                      '✓ Ready'
                    ) : f.status === 'error' ? (
                      '✗ Error'
                    ) : (
                      f.status
                    )}
                  </span>
                  <button className="file-remove" onClick={() => removeFile(f.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="upload-actions">
            <button
              className="btn btn-primary"
              disabled={!hasReadyFiles}
              onClick={generateDashboard}
            >
              Generate My Dashboard
            </button>
            <div className="upload-bottom-actions">
              <button className="btn btn-secondary" onClick={loadSampleData}>
                Try Sample Data
              </button>
              <button className="btn btn-ghost" onClick={resetData}>
                Reset All Data
              </button>
            </div>
          </div>

          <p className="upload-note">
            Your data stays in your account, protected by row-level security.
          </p>
        </div>
      </div>

      {/* Dashboard View */}
      <div
        className={`dashboard-view ${view === 'dashboard' ? 'active' : ''}`}
        style={{ display: view === 'dashboard' ? 'block' : 'none' }}
      >
        {dashboardData && (
          <>
            {/* Hero Section */}
            <section className="hero-section" id="heroSection">
              <div className="hero-content">
                <h1 className="hero-title gradient-text">Financial Overview</h1>
                <p className="hero-subtitle" id="dateRange">
                  {formatMonth(dashboardData.summary.date_range.start)} —{' '}
                  {formatMonth(dashboardData.summary.date_range.end)}
                </p>
              </div>
              <div className="kpi-grid" id="kpiGrid">
                {/* Total Spend */}
                <div className="kpi-card">
                  <div className="kpi-label">Total Spend</div>
                  <div className="kpi-value">
                    ${animNum(dashboardData.summary.total_spend)}
                  </div>
                  <div className="kpi-detail">
                    {Object.entries(dashboardData.summary.card_totals)
                      .map(([c, v]) => `${c}: $${v.toLocaleString()}`)
                      .join(' · ') || '—'}
                  </div>
                </div>
                {/* Monthly Average */}
                <div className="kpi-card">
                  <div className="kpi-label">Monthly Average</div>
                  <div className="kpi-value">
                    ${animNum(dashboardData.summary.monthly_avg)}
                  </div>
                  <div className="kpi-detail">
                    Daily avg: <span>${dashboardData.summary.daily_avg.toFixed(2)}</span>
                  </div>
                </div>
                {/* Total Interest Paid */}
                <div className="kpi-card">
                  <div className="kpi-label">Total Interest Paid</div>
                  <div className="kpi-value">
                    ${animNum(dashboardData.summary.total_interest)}
                  </div>
                  <div className="kpi-detail">
                    {Object.entries(dashboardData.summary.interest_by_card || {})
                      .map(([c, v]) => `${c}: $${v.toLocaleString()}`)
                      .join(' · ') || 'No interest charges'}
                  </div>
                </div>
                {/* Total Transactions */}
                <div className="kpi-card">
                  <div className="kpi-label">Total Transactions</div>
                  <div className="kpi-value">
                    {animNum(dashboardData.summary.total_transactions, false)}
                  </div>
                  <div className="kpi-detail">
                    ~<span>{dashboardData.summary.per_day_avg}</span> per day
                  </div>
                </div>
              </div>
            </section>

            {/* Monthly Spending Trends (Credit Cards) */}
            <section className="chart-section" id="sectionMonthly">
              <div className="section-header">
                <div>
                  {(dashboardData.account_types || []).length > 1 && (
                    <div className="section-account-label credit">💳 Credit Cards</div>
                  )}
                  <h2 className="section-title">Monthly Spending Trends</h2>
                </div>
              </div>
              <div className="chart-card">
                <canvas ref={chartRefs.chartMonthly} id="chartMonthly" />
              </div>
            </section>

            {/* Spending by Category (Credit Cards) */}
            <section className="chart-section" id="sectionCategory">
              <div className="section-header">
                <h2 className="section-title">Spending by Category</h2>
              </div>
              <div className="chart-row">
                <div className="chart-card">
                  <canvas ref={chartRefs.chartCategoryBar} id="chartCategoryBar" />
                </div>
                <div className="chart-card">
                  <canvas ref={chartRefs.chartCategoryDonut} id="chartCategoryDonut" />
                </div>
              </div>
            </section>

            {/* Category Trends Over Time */}
            <section className="chart-section" id="sectionCatTrend">
              <div className="section-header">
                <h2 className="section-title">Category Trends Over Time</h2>
              </div>
              <div className="chart-card">
                <canvas ref={chartRefs.chartCatTrend} id="chartCatTrend" />
              </div>
            </section>

            {/* Top Merchants */}
            <section className="chart-section" id="sectionMerchants">
              <div className="section-header">
                <h2 className="section-title">Top Merchants</h2>
              </div>
              <div className="chart-card">
                <canvas ref={chartRefs.chartMerchants} id="chartMerchants" />
              </div>
            </section>

            {/* Interest Analysis */}
            <section className="chart-section" id="sectionInterest">
              <div className="section-header">
                <h2 className="section-title">Interest Analysis</h2>
              </div>
              <div className="chart-card">
                <canvas ref={chartRefs.chartInterest} id="chartInterest" />
              </div>
              {dashboardData.interest.total > 0 && (
                <div className="interest-callout" id="interestCallout">
                  <span className="callout-icon">⚠️</span>
                  <span>
                    <strong>Opportunity Cost of Interest</strong>{' '}
                    You&apos;ve paid ${dashboardData.interest.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} in interest charges.{' '}
                    If invested at 7% annual return, this could have grown by ~$
                    {(dashboardData.interest.total * 0.07).toFixed(2)} in a year.{' '}
                    Consider balance transfer offers or accelerated payoff strategies.
                  </span>
                </div>
              )}
            </section>

            {/* Balance Tracker */}
            <section className="chart-section" id="sectionBalance">
              <div className="section-header">
                <h2 className="section-title">Balance Tracker</h2>
              </div>
              <div className="chart-card">
                <canvas ref={chartRefs.chartBalance} id="chartBalance" />
              </div>
            </section>

            {/* Savings Overview */}
            {dashboardData.savings && (
              <section className="chart-section" id="sectionSavings">
                <div className="section-header">
                  <div>
                    <div className="section-account-label savings">🏦 Savings / Checking</div>
                    <h2 className="section-title">Savings Overview</h2>
                  </div>
                </div>
                <div className="kpi-grid-compact">
                  <div className="kpi-card-compact">
                    <div className="kpi-label">Total Deposits</div>
                    <div className="kpi-value" style={{ color: 'var(--accent-green)' }}>
                      ${dashboardData.savings.total_deposits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="kpi-detail">{dashboardData.savings.accounts.join(' · ')}</div>
                  </div>
                  <div className="kpi-card-compact">
                    <div className="kpi-label">Total Withdrawals</div>
                    <div className="kpi-value" style={{ color: 'var(--accent-red)' }}>
                      ${dashboardData.savings.total_withdrawals.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="kpi-detail">Excludes inter-account transfers</div>
                  </div>
                  <div className="kpi-card-compact">
                    <div className="kpi-label">Net Cash Flow</div>
                    <div className="kpi-value" style={{ color: dashboardData.savings.net_cash_flow >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {dashboardData.savings.net_cash_flow >= 0 ? '+' : ''}${dashboardData.savings.net_cash_flow.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="kpi-detail">Deposits minus withdrawals</div>
                  </div>
                  {dashboardData.savings.interest_earned > 0 && (
                    <div className="kpi-card-compact">
                      <div className="kpi-label">Interest Earned</div>
                      <div className="kpi-value" style={{ color: 'var(--accent-teal)' }}>
                        ${dashboardData.savings.interest_earned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="kpi-detail">APY / savings interest</div>
                    </div>
                  )}
                </div>
                <div className="chart-card">
                  <canvas ref={chartRefs.chartSavingsMonthly} id="chartSavingsMonthly" />
                </div>
                {dashboardData.savings.monthly.months.length > 0 && (
                  <div className="chart-card" style={{ marginTop: 16 }}>
                    <canvas ref={chartRefs.chartSavingsBalance} id="chartSavingsBalance" />
                  </div>
                )}
              </section>
            )}

            {/* Investment Activity */}
            {dashboardData.investments && (
              <section className="chart-section" id="sectionInvestments">
                <div className="section-header">
                  <div>
                    <div className="section-account-label investment">📈 Investments</div>
                    <h2 className="section-title">Investment Activity</h2>
                  </div>
                </div>
                <div className="kpi-grid-compact">
                  <div className="kpi-card-compact">
                    <div className="kpi-label">Total Contributions</div>
                    <div className="kpi-value" style={{ color: 'var(--accent-orange)' }}>
                      ${dashboardData.investments.total_contributions.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="kpi-detail">{dashboardData.investments.accounts.join(' · ')}</div>
                  </div>
                  <div className="kpi-card-compact">
                    <div className="kpi-label">Dividends Received</div>
                    <div className="kpi-value" style={{ color: 'var(--accent-blue)' }}>
                      ${dashboardData.investments.total_dividends.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="kpi-detail">Distributions & dividends</div>
                  </div>
                </div>
                <div className="chart-card">
                  <canvas ref={chartRefs.chartInvestmentsMonthly} id="chartInvestmentsMonthly" />
                </div>
              </section>
            )}

            {/* Day-of-Week Spending */}
            <section className="chart-section" id="sectionDow">
              <div className="section-header">
                <h2 className="section-title">Day-of-Week Spending</h2>
              </div>
              <div className="chart-card">
                <canvas ref={chartRefs.chartDow} id="chartDow" />
              </div>
            </section>

            {/* Smart Insights */}
            <section className="insights-section" id="sectionInsights">
              <div className="section-header">
                <h2 className="section-title">Smart Insights</h2>
              </div>
              <div className="insights-grid" id="insightsGrid">
                {dashboardData.insights.map((ins, idx) => (
                  <div className="insight-card" key={idx}>
                    <div className="insight-icon">{ins.icon}</div>
                    <div className="insight-title">{ins.title}</div>
                    <div className="insight-value">{ins.value}</div>
                    <div className="insight-detail">{ins.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Actionable Tips */}
            <section className="tips-section" id="sectionTips">
              <div className="section-header">
                <h2 className="section-title">Actionable Tips</h2>
              </div>
              <div className="tips-grid" id="tipsGrid">
                {dashboardData.tips.map((tip, idx) => (
                  <div
                    className="tip-card"
                    key={idx}
                    style={{ '--tip-color': tip.color } as React.CSSProperties}
                  >
                    <div className="tip-header">
                      <span className="tip-emoji">{tip.emoji}</span>
                      <div className="tip-title">{tip.title}</div>
                    </div>
                    <div className="tip-text">{tip.text}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Transaction Explorer */}
            <section className="transactions-section" id="sectionTransactions">
              <div className="section-header">
                <h2 className="section-title">Transaction Explorer</h2>
              </div>
              <div className="tx-controls">
                <input
                  type="text"
                  id="txSearch"
                  className="tx-search"
                  placeholder="Search transactions..."
                  value={txState.search}
                  onChange={(e) =>
                    setTxState((prev) => ({ ...prev, search: e.target.value, page: 1 }))
                  }
                />
                {(dashboardData.account_types || []).length > 1 && (
                  <select
                    className="tx-filter"
                    value={txState.accountTypeFilter}
                    onChange={(e) =>
                      setTxState((prev) => ({ ...prev, accountTypeFilter: e.target.value, cardFilter: '', page: 1 }))
                    }
                  >
                    <option value="">All Accounts</option>
                    <option value="credit_card">💳 Credit Cards</option>
                    <option value="savings">🏦 Savings</option>
                    <option value="investment">📈 Investments</option>
                  </select>
                )}
                <select
                  id="txCardFilter"
                  className="tx-filter"
                  value={txState.cardFilter}
                  onChange={(e) =>
                    setTxState((prev) => ({ ...prev, cardFilter: e.target.value, page: 1 }))
                  }
                >
                  <option value="">All Cards</option>
                  {txCards.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  id="txCategoryFilter"
                  className="tx-filter"
                  value={txState.categoryFilter}
                  onChange={(e) =>
                    setTxState((prev) => ({ ...prev, categoryFilter: e.target.value, page: 1 }))
                  }
                >
                  <option value="">All Categories</option>
                  {txCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  id="txMonthFilter"
                  className="tx-filter"
                  value={txState.monthFilter}
                  onChange={(e) =>
                    setTxState((prev) => ({ ...prev, monthFilter: e.target.value, page: 1 }))
                  }
                >
                  <option value="">All Months</option>
                  {txMonths.map((m) => (
                    <option key={m} value={m}>
                      {formatMonthShort(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="tx-table-wrapper">
                <table className="tx-table" id="txTable">
                  <thead>
                    <tr>
                      <th
                        data-sort="date"
                        className={txState.sortCol === 'date' ? 'sorted' : ''}
                        onClick={() => handleSort('date')}
                      >
                        Date{' '}
                        <span className="sort-arrow">
                          {txState.sortCol === 'date'
                            ? txState.sortDir === 'asc'
                              ? '▲'
                              : '▼'
                            : '▼'}
                        </span>
                      </th>
                      <th
                        data-sort="description"
                        className={txState.sortCol === 'description' ? 'sorted' : ''}
                        onClick={() => handleSort('description')}
                      >
                        Description{' '}
                        <span className="sort-arrow">
                          {txState.sortCol === 'description'
                            ? txState.sortDir === 'asc'
                              ? '▲'
                              : '▼'
                            : '▼'}
                        </span>
                      </th>
                      <th
                        data-sort="amount"
                        className={txState.sortCol === 'amount' ? 'sorted' : ''}
                        onClick={() => handleSort('amount')}
                      >
                        Amount{' '}
                        <span className="sort-arrow">
                          {txState.sortCol === 'amount'
                            ? txState.sortDir === 'asc'
                              ? '▲'
                              : '▼'
                            : '▼'}
                        </span>
                      </th>
                      <th
                        data-sort="card"
                        className={txState.sortCol === 'card' ? 'sorted' : ''}
                        onClick={() => handleSort('card')}
                      >
                        Card{' '}
                        <span className="sort-arrow">
                          {txState.sortCol === 'card'
                            ? txState.sortDir === 'asc'
                              ? '▲'
                              : '▼'
                            : '▼'}
                        </span>
                      </th>
                      <th
                        data-sort="category"
                        className={txState.sortCol === 'category' ? 'sorted' : ''}
                        onClick={() => handleSort('category')}
                      >
                        Category{' '}
                        <span className="sort-arrow">
                          {txState.sortCol === 'category'
                            ? txState.sortDir === 'asc'
                              ? '▲'
                              : '▼'
                            : '▼'}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody id="txBody">
                    {pagedTxns.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}
                        >
                          No matching transactions
                        </td>
                      </tr>
                    ) : (
                      pagedTxns.map((t, idx) => {
                        const acctType = t.account_type || 'credit_card'
                        const cardClass = acctType === 'savings'
                          ? 'savings'
                          : acctType === 'investment'
                          ? 'investment'
                          : t.card.toLowerCase().includes('chase')
                          ? 'chase'
                          : t.card.toLowerCase().includes('apple')
                          ? 'apple'
                          : 'default-card'
                        const amountClass = t.amount < 0 ? 'negative' : 'positive'
                        return (
                          <tr key={t.id ?? `${txStart + idx}`}>
                            <td>{formatDate(t.date)}</td>
                            <td>{truncate(t.description, 45)}</td>
                            <td className={`amount-cell ${amountClass}`}>
                              {t.amount < 0 ? '-' : '+'}${Math.abs(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td>
                              <span className={`card-badge ${cardClass}`}>{t.card}</span>
                            </td>
                            <td>
                              <span className="category-badge">{t.category}</span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="tx-pagination" id="txPagination">
                <button
                  className="page-btn"
                  disabled={currentPage <= 1}
                  onClick={() => changeTxPage(currentPage - 1)}
                >
                  ←
                </button>
                {paginationPages.map((p, i) =>
                  p === '...' ? (
                    <span
                      key={`ellipsis-${i}`}
                      style={{ padding: '6px 4px', color: 'var(--text-muted)' }}
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={`page-btn ${p === currentPage ? 'active' : ''}`}
                      onClick={() => changeTxPage(p as number)}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  className="page-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => changeTxPage(currentPage + 1)}
                >
                  →
                </button>
                <span className="page-info" style={{ minWidth: 120, textAlign: 'center' }}>
                  {filteredTxns.length > 0 ? txStart + 1 : 0}–
                  {Math.min(txStart + txState.perPage, filteredTxns.length)} of{' '}
                  {filteredTxns.length}
                </span>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  )
}
