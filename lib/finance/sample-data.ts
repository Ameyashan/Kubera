import { type ParsedTransaction } from './parsers'

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function generateSampleData(): ParsedTransaction[] {
  const random = seededRandom(42)
  const transactions: ParsedTransaction[] = []
  const cards = ["Chase Sapphire", "Apple Card"]

  const merchants: Record<string, Array<[string, number, number]>> = {
    "Dining & Restaurants": [
      ["Sweetgreen", 12, 18], ["Chipotle", 10, 16], ["Starbucks Coffee", 4, 8],
      ["Shake Shack", 14, 22], ["Ramen Nagi", 18, 28], ["Panera Bread", 10, 16],
      ["Joe's Pizza", 5, 12], ["Dilli Kebab", 12, 20], ["Blue Bottle Coffee", 5, 9],
      ["The Grill Room", 45, 120], ["Bistro 44", 35, 85], ["Poke Bowl", 14, 20],
      ["Dunkin Donuts", 3, 8], ["Wingstop", 15, 25],
    ],
    "Food Delivery": [
      ["DoorDash", 18, 45], ["Uber Eats", 15, 40], ["Grubhub", 20, 50], ["Seamless", 15, 35],
    ],
    "Groceries": [
      ["Whole Foods Market", 35, 120], ["Trader Joe's", 25, 80], ["Target", 20, 90],
      ["Costco", 80, 250], ["Wegmans", 40, 100],
    ],
    "Public Transit": [
      ["MTA Subway", 2.9, 2.9], ["PATH Train", 2.75, 2.75],
    ],
    "Ride-sharing & Taxis": [
      ["Uber Trip", 12, 45], ["Lyft", 10, 38],
    ],
    "Travel": [
      ["Delta Airlines", 180, 450], ["Airbnb", 100, 300], ["Amtrak", 30, 90],
      ["Marriott Hotel", 150, 350], ["JetBlue Airways", 120, 350],
    ],
    "Shopping": [
      ["Amazon.com", 10, 150], ["Apple Store", 15, 200], ["Nike.com", 60, 180],
      ["Uniqlo", 25, 80], ["Best Buy", 30, 300],
    ],
    "Subscriptions & Software": [
      ["Spotify Premium", 10.99, 10.99], ["Netflix", 15.49, 15.49], ["OpenAI ChatGPT Plus", 20, 20],
      ["iCloud Storage", 2.99, 2.99], ["Adobe CC", 54.99, 54.99], ["GitHub Pro", 4, 4],
      ["Cursor Pro", 20, 20], ["Vercel Pro", 20, 20], ["YouTube Premium", 13.99, 13.99],
      ["Lemonade Insurance", 35, 35],
    ],
    "Entertainment": [
      ["AMC Cinema", 15, 22], ["Broadway Ticket", 80, 200], ["Museum of Modern Art", 25, 25],
    ],
    "Health & Pharmacy": [
      ["CVS Pharmacy", 8, 40], ["Walgreens", 5, 30], ["Equinox Gym", 200, 200],
    ],
  }

  const pick = (arr: any[]) => arr[Math.floor(random() * arr.length)]
  const randRange = (lo: number, hi: number) => lo + random() * (hi - lo)
  const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()

  // Generate 12 months (Mar 2025 - Feb 2026)
  for (let mi = 0; mi < 12; mi++) {
    const year = mi < 10 ? 2025 : 2026
    const month = ((mi + 2) % 12) + 1  // Mar=3...Dec=12, Jan=1, Feb=2
    const dim = daysInMonth(year, month)
    const pad = (n: number) => String(n).padStart(2, '0')

    // Subscriptions
    for (const [name, lo, hi] of merchants["Subscriptions & Software"]) {
      const day = Math.min(Math.floor(random() * 5) + 1, dim)
      transactions.push({
        date: `${year}-${pad(month)}-${pad(day)}`,
        description: name,
        amount: -Math.round(randRange(lo, hi) * 100) / 100,
        card: pick(cards),
        category: "Subscriptions & Software",
        account_type: "credit_card",
      })
    }

    // Daily patterns
    for (let day = 1; day <= dim; day++) {
      const date = `${year}-${pad(month)}-${pad(day)}`
      const d = new Date(date + 'T00:00:00')
      const dow = d.getDay() // 0=Sun

      // Transit on weekdays
      if (dow >= 1 && dow <= 5 && random() < 0.8) {
        const [name, lo, hi] = pick(merchants["Public Transit"])
        transactions.push({ date, description: name, amount: -Math.round(randRange(lo, hi) * 100) / 100, card: "Apple Card", category: "Public Transit", account_type: "credit_card" })
      }

      // Dining
      const diningChance = (dow === 0 || dow === 6) ? 0.6 : 0.35
      if (random() < diningChance) {
        const [name, lo, hi] = pick(merchants["Dining & Restaurants"])
        transactions.push({ date, description: name, amount: -Math.round(randRange(lo, hi) * 100) / 100, card: pick(cards), category: "Dining & Restaurants", account_type: "credit_card" })
      }

      // Coffee
      if (random() < 0.4) {
        const coffeeSpots: Array<[string, number, number]> = [["Starbucks Coffee", 4, 7], ["Blue Bottle Coffee", 5, 8], ["Dunkin Donuts", 3, 6]]
        const [name, lo, hi] = pick(coffeeSpots)
        transactions.push({ date, description: name, amount: -Math.round(randRange(lo, hi) * 100) / 100, card: "Apple Card", category: "Dining & Restaurants", account_type: "credit_card" })
      }

      // Food delivery
      if (random() < 0.15) {
        const [name, lo, hi] = pick(merchants["Food Delivery"])
        transactions.push({ date, description: name, amount: -Math.round(randRange(lo, hi) * 100) / 100, card: pick(cards), category: "Food Delivery", account_type: "credit_card" })
      }

      // Ride-sharing
      if (((dow === 0 || dow === 6) && random() < 0.3) || random() < 0.08) {
        const [name, lo, hi] = pick(merchants["Ride-sharing & Taxis"])
        transactions.push({ date, description: name, amount: -Math.round(randRange(lo, hi) * 100) / 100, card: pick(cards), category: "Ride-sharing & Taxis", account_type: "credit_card" })
      }
    }

    // Groceries (3-5 per month)
    for (let j = 0; j < Math.floor(random() * 3) + 3; j++) {
      const day = Math.floor(random() * Math.min(dim, 28)) + 1
      const [name, lo, hi] = pick(merchants["Groceries"])
      transactions.push({ date: `${year}-${pad(month)}-${pad(day)}`, description: name, amount: -Math.round(randRange(lo, hi) * 100) / 100, card: "Chase Sapphire", category: "Groceries", account_type: "credit_card" })
    }

    // Shopping (2-4 per month)
    for (let j = 0; j < Math.floor(random() * 3) + 2; j++) {
      const day = Math.floor(random() * Math.min(dim, 28)) + 1
      const [name, lo, hi] = pick(merchants["Shopping"])
      transactions.push({ date: `${year}-${pad(month)}-${pad(day)}`, description: name, amount: -Math.round(randRange(lo, hi) * 100) / 100, card: pick(cards), category: "Shopping", account_type: "credit_card" })
    }

    // Entertainment (0-2)
    for (let j = 0; j < Math.floor(random() * 3); j++) {
      const day = Math.floor(random() * Math.min(dim, 28)) + 1
      const [name, lo, hi] = pick(merchants["Entertainment"])
      transactions.push({ date: `${year}-${pad(month)}-${pad(day)}`, description: name, amount: -Math.round(randRange(lo, hi) * 100) / 100, card: pick(cards), category: "Entertainment", account_type: "credit_card" })
    }

    // Health (1-2)
    for (let j = 0; j < Math.floor(random() * 2) + 1; j++) {
      const day = Math.floor(random() * Math.min(dim, 28)) + 1
      const [name, lo, hi] = pick(merchants["Health & Pharmacy"])
      transactions.push({ date: `${year}-${pad(month)}-${pad(day)}`, description: name, amount: -Math.round(randRange(lo, hi) * 100) / 100, card: pick(cards), category: "Health & Pharmacy", account_type: "credit_card" })
    }

    // Travel (occasional)
    if (random() < 0.25) {
      const day = Math.floor(random() * Math.min(dim, 28)) + 1
      const [name, lo, hi] = pick(merchants["Travel"])
      transactions.push({ date: `${year}-${pad(month)}-${pad(day)}`, description: name, amount: -Math.round(randRange(lo, hi) * 100) / 100, card: "Chase Sapphire", category: "Travel", account_type: "credit_card" })
    }

    // Interest charges (60% chance)
    if (random() < 0.6) {
      const day = Math.min(dim, 28)
      for (const cardName of cards) {
        transactions.push({
          date: `${year}-${pad(month)}-${pad(day)}`,
          description: `Interest Charge - ${cardName}`,
          amount: -Math.round(randRange(15, 65) * 100) / 100,
          card: cardName,
          category: "Other",
          account_type: "credit_card",
        })
      }
    }
  }

  return transactions
}
