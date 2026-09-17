/** Ported unchanged from the cooler-calls prototype (src/lib/parseMessage.ts). */
export type Equipment = 'walk-in cooler' | 'walk-in freezer' | 'ice machine' | 'reach-in' | 'other'
export type Source = 'call' | 'text' | 'web form' | 'referral' | 'repeat'

/**
 * What we can guess from a pasted text or form email.
 * Every field is optional: the user reviews before saving.
 * Swap this module for an LLM call later; keep the return shape.
 */
export interface ParsedMessage {
  customerName?: string
  businessName?: string
  phone?: string
  equipment?: Equipment
  issue?: string
  urgent?: boolean
  source?: Source
}

const MAX_INPUT = 20_000
const MAX_ISSUE = 240

/* ---------- phone ---------- */

interface PhonePattern {
  re: RegExp
  format: (m: RegExpMatchArray) => string
}

// Order matters only for ties at the same position; otherwise the earliest match wins.
const PHONE_PATTERNS: PhonePattern[] = [
  // +91 98765 43210, +91-9876543210, 0091 98765 43210
  { re: /(?:\+|00)91[\s.-]?(\d{5})[\s.-]?(\d{5})\b/, format: (m) => `+91 ${m[1]} ${m[2]}` },
  // (555) 123-4567, 555-123-4567, 555.123.4567, +1 555 123 4567, 5551234567
  {
    re: /(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/,
    format: (m) => `(${m[1]}) ${m[2]}-${m[3]}`,
  },
  // 98765 43210 (Indian mobile without a country code)
  { re: /\b(\d{5})[\s-](\d{5})\b/, format: (m) => `${m[1]} ${m[2]}` },
]

function findPhone(text: string): string | undefined {
  let best: { index: number; value: string } | null = null
  for (const p of PHONE_PATTERNS) {
    const m = text.match(p.re)
    if (m && m.index !== undefined && (best === null || m.index < best.index)) {
      best = { index: m.index, value: p.format(m) }
    }
  }
  return best?.value
}

/* ---------- urgency ---------- */

const URGENT_RE =
  /\b(down|not working|isn'?t working|stopped working|quit working|no longer working|emergency|urgent|urgently|asap|warm|warming up|not cooling|not cold|isn'?t cooling|no longer cooling|thawing|thawed|melting|dead|broken|right away)\b/i

// "not urgent", "no rush", "not an emergency", "whenever you get a chance" override everything.
const NOT_URGENT_RE = /\b(not|no|non|isn'?t)[\s-]*(an?\s+)?(urgent|rush|hurry|emergency)\b|\bwhenever\b|\bno big deal\b/i

/* ---------- equipment ---------- */

// Earliest mention in the text wins; on a tie, the earlier entry here wins.
const EQUIPMENT_PATTERNS: Array<[RegExp, Equipment]> = [
  [/reach[\s-]*in|display\s+case|deli\s+case|prep\s+table|sandwich\s+unit|beverage\s+cooler|merchandiser|under[\s-]*counter/i, 'reach-in'],
  [/walk[\s-]*in\s+freezer|freezer/i, 'walk-in freezer'],
  [/ice[\s-]*(machine|maker)|icemaker|ice\s+bin/i, 'ice machine'],
  [/walk[\s-]*in(\s+cooler)?|cooler|refrigerator|fridge/i, 'walk-in cooler'],
]

function findEquipment(text: string): Equipment | undefined {
  let best: { index: number; value: Equipment } | null = null
  for (const [re, value] of EQUIPMENT_PATTERNS) {
    const m = text.match(re)
    if (m && m.index !== undefined && (best === null || m.index < best.index)) best = { index: m.index, value }
  }
  if (best) return best.value
  if (/\b(refrigerat|cooling|ice)\b/i.test(text)) return 'other'
  return undefined
}

/* ---------- text helpers ---------- */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** Strip tags and decode the handful of entities that show up in forwarded emails. */
function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/tr>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e: string) => ENTITIES[e] ?? '')
}

const BUSINESS_WORDS =
  /\b(restaurant|diner|cafe|café|grill|bar|pub|tap|pizza|pizzeria|market|deli|bakery|kitchen|bistro|hotel|motel|grocery|catering|butcher|tavern|brewery|taqueria|cantina|steakhouse|eatery|foods?|mart|store|shop|inc|llc)\b/i

/** Pull "Label: value" lines out of form-style emails. */
function fields(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*\*?\s*([A-Za-z][A-Za-z /]{1,30}?)\s*[:：]\s*(.+?)\s*$/)
    if (m) out[m[1].trim().toLowerCase()] = m[2].trim()
  }
  return out
}

function pick(f: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) if (f[k]) return f[k]
  return undefined
}

function cleanName(s: string): string {
  return s.replace(/[.,!]+$/, '').replace(/\s+/g, ' ').trim()
}

function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/* ---------- main ---------- */

function parse(raw: string): ParsedMessage {
  const text = stripHtml(raw.slice(0, MAX_INPUT)).trim()
  if (!text) return {}
  const f = fields(text)
  const result: ParsedMessage = {}

  // Phone
  const phoneField = pick(f, 'phone', 'phone number', 'tel', 'telephone', 'cell', 'mobile', 'number', 'contact number')
  const phone = findPhone(phoneField ?? text)
  if (phone) result.phone = phone

  // Name
  const nameField = pick(f, 'name', 'full name', 'your name', 'contact', 'contact name', 'from', 'customer', 'customer name')
  if (nameField) {
    const cleaned = cleanName(nameField.replace(/<.*>/, '').replace(/[\d()+.-]{7,}/g, ''))
    if (cleaned) result.customerName = cleaned
  } else {
    // Capitalised words only, so "this is Jake from Harbor Grill" stops at "Jake".
    const m =
      text.match(/\b(?:[Mm]y name is|[Tt]his is|[Ii]'m|[Ii] am|[Ii]t's|[Ii]ts)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/) ??
      text.match(/(?:[Tt]hanks,?|[Tt]hank you,?|[Rr]egards,?|[Bb]est,?|[Cc]heers,?|^\s*[-–—])\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/m)
    if (m) result.customerName = titleCase(cleanName(m[1]))
  }

  // Business
  const bizField = pick(f, 'business', 'business name', 'company', 'company name', 'organization', 'restaurant')
  if (bizField) {
    result.businessName = cleanName(bizField)
  } else {
    const m =
      text.match(/\b(?:from|at|for|with|own|run|manage)\s+(?:the\s+)?([A-Z][\w'&.-]*(?:\s+[A-Z&][\w'&.-]*){0,4})/) ??
      text.match(/\b([A-Z][\w'&.-]*(?:\s+[A-Z&][\w'&.-]*){0,3}\s+(?:Restaurant|Diner|Cafe|Café|Grill|Bar|Pizza|Pizzeria|Market|Deli|Bakery|Kitchen|Bistro|Hotel|Grocery|Catering|Butcher|Tavern|Brewery|Steakhouse|Mart))\b/)
    if (m) {
      const candidate = cleanName(m[1])
      // Don't mistake the customer's own name for a business.
      if (candidate !== result.customerName && (BUSINESS_WORDS.test(candidate) || m[0].startsWith('at') || m[0].startsWith('from')))
        result.businessName = candidate
    }
  }

  // Equipment
  const equipField = pick(f, 'equipment', 'unit', 'equipment type')
  const equipment = findEquipment(equipField ?? text)
  if (equipment) result.equipment = equipment

  // Urgent
  result.urgent = URGENT_RE.test(text) && !NOT_URGENT_RE.test(text)

  // Issue: prefer a message/issue field, otherwise the body minus the boilerplate.
  const issueField = pick(f, 'message', 'issue', 'problem', 'description', 'details', 'comments', 'comment', 'notes', 'how can we help')
  if (issueField) {
    result.issue = issueField.length > MAX_ISSUE ? issueField.slice(0, MAX_ISSUE - 1).trimEnd() + '…' : issueField
  } else {
    const body = text
      .split(/\r?\n/)
      .filter((line) => !/^\s*[A-Za-z][A-Za-z /]{1,30}\s*[:：]/.test(line)) // drop "Label: value" lines
      .filter((line) => !/^\s*(thanks|thank you|regards|best|-|–|—)/i.test(line))
      .join(' ')
      .replace(/(?:\+|00)91[\s.-]?\d{5}[\s.-]?\d{5}|(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (body) result.issue = body.length > MAX_ISSUE ? body.slice(0, MAX_ISSUE - 1).trimEnd() + '…' : body
  }

  // Source: form-style emails have labelled fields.
  result.source = Object.keys(f).length >= 2 || /\bform\b|submitted|website/i.test(text) ? 'web form' : 'text'

  return result
}

/** Never throws: a bad paste should just leave the form blank. */
export function parseMessage(raw: string): ParsedMessage {
  try {
    return parse(typeof raw === 'string' ? raw : String(raw ?? ''))
  } catch {
    return {}
  }
}
