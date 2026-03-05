const CATEGORY_RULES: Record<string, string[]> = {
  "Dining & Restaurants": ["restaurant", "cafe", "coffee", "starbucks", "chipotle", "mcdonald", "pizza", "sushi", "bar ", "grill", "kitchen", "diner", "bistro", "taco", "burger", "bakery", "cafeteria", "dilli", "kebab", "sharab", "ramen", "poke", "wingstop", "chick-fil", "panera", "sweetgreen", "shake shack", "dunkin"],
  "Food Delivery": ["uber eats", "doordash", "grubhub", "postmates", "seamless", "caviar"],
  "Groceries": ["whole foods", "trader joe", "grocery", "market", "fresh", "wegmans", "target", "costco", "aldi", "safeway", "kroger"],
  "Public Transit": ["mta", "path train", "metro", "transit", "subway", "bus", "train", "caltrain", "bart", "wmata"],
  "Ride-sharing & Taxis": ["uber trip", "lyft", "taxi", "cab ", "ride share"],
  "Travel": ["airline", "delta", "united", "american air", "southwest", "jetblue", "hotel", "marriott", "hilton", "airbnb", "expedia", "amtrak", "booking.com", "hostel", "hyatt", "holiday inn"],
  "Car Rental & Gas": ["avis", "hertz", "enterprise rent", "sixt", "zipcar", "rent-a-car", "gas station", "shell", "chevron", "exxon", "bp ", "fuel", "etollavis"],
  "Shopping": ["amazon", "best buy", "target", "walmart", "apple store", "ebay", "etsy", "nordstrom", "zara", "h&m", "nike", "uniqlo", "gap", "old navy", "marshalls"],
  "Subscriptions & Software": ["spotify", "netflix", "hulu", "youtube premium", "adobe", "cursor", "canva", "apple subscriptions", "icloud", "dropbox", "openai", "anthropic", "github", "vercel", "aws", "google cloud", "lemonade", "opus clip", "chatgpt", "notion", "slack", "zoom"],
  "Entertainment": ["cinema", "movie", "theater", "concert", "ticket", "event", "museum", "show", "bowling", "arcade"],
  "Health & Pharmacy": ["pharmacy", "cvs", "walgreens", "duane", "rite aid", "doctor", "medical", "dental", "health", "vitamin", "gym", "fitness"],
  "Utilities & Bills": ["electric", "water", "internet", "comcast", "verizon", "at&t", "t-mobile", "utility", "phone bill", "cable"],
  "Rent & Housing": ["rent", "mortgage", "housing", "landlord", "property"],
  "Income": ["payroll", "direct deposit", "salary", "wage", "paycheck", "venmo credit", "zelle credit"],
  "Transfer": ["transfer", "payment thank you", "autopay", "online payment"],
}

export function categorize(description: string): string {
  const descLower = description.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_RULES)) {
    for (const kw of keywords) {
      if (descLower.includes(kw)) return cat
    }
  }
  return "Other"
}
