import { afterEach, describe, expect, it } from 'vitest'
import { callReason, callToday, type RuleJob } from '@/lib/rules/callToday'
import { toDateKey } from '@/lib/rules/dates'

// Ported from the cooler-calls prototype. The prototype used display names for stages;
// this app stores ids. The helper below maps them so every original scenario is kept as-is.
const STAGE_ID: Record<string, string> = {
  'Needs quote': 'needs_quote',
  'Waiting on yes': 'waiting_on_yes',
  'Approved – schedule': 'approved',
  Scheduled: 'scheduled',
  Done: 'done',
  Lost: 'lost',
}
type Job = RuleJob & { stage: string; quoteAmount?: number; notes?: string; history?: unknown[]; customerName?: string; businessName?: string; phone?: string; source?: string; issue?: string; equipment?: string }

// Wed Sep 16 2026, 9:00 local. Every test is relative to this.
const NOW = new Date(2026, 8, 16, 9, 0, 0)

/** A local time `n` days before NOW, at a given hour:minute. */
const daysAgo = (n: number, hour = 10, minute = 0) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  d.setHours(hour, minute, 0, 0)
  return d
}
const iso = (d: Date) => d.toISOString()
const minusMs = (d: Date, ms: number) => new Date(d.getTime() - ms)
const H = 60 * 60 * 1000

let seq = 0
function job(overrides: Partial<Job> = {}): Job {
  seq += 1
  const j: Job = {
    id: `j${seq}`,
    customerName: 'Test Customer',
    businessName: 'Test Co',
    phone: '555-0100',
    source: 'call',
    issue: 'Something',
    equipment: 'walk-in cooler',
    urgent: false,
    stage: 'Needs quote',
    createdAt: iso(daysAgo(0)),
    lastContactAt: null,
    notes: '',
    history: [],
    ...overrides,
  }
  j.stage = STAGE_ID[j.stage] ?? j.stage
  return j
}

describe('rule 1: equipment down', () => {
  it('urgent job with no quote is "Equipment down" in red', () => {
    const r = callReason(job({ urgent: true, createdAt: iso(daysAgo(3)) }), NOW)
    expect(r?.rule).toBe('equipment-down')
    expect(r?.reason).toBe('Equipment down — call now')
    expect(r?.critical).toBe(true)
    expect(r?.waitingDays).toBe(3)
  })

  it('urgent job that WAS contacted yesterday is still flagged (it is still down and unquoted)', () => {
    // Decision: an urgent, unquoted job nags every day until it's quoted. Calling once doesn't fix a down freezer.
    const r = callReason(job({ urgent: true, createdAt: iso(daysAgo(2)), lastContactAt: iso(daysAgo(1)) }), NOW)
    expect(r?.rule).toBe('equipment-down')
  })

  it('urgent job contacted today drops off for the rest of the day', () => {
    const r = callReason(job({ urgent: true, createdAt: iso(daysAgo(2)), lastContactAt: iso(daysAgo(0, 8)) }), NOW)
    expect(r).toBeNull()
  })

  it('urgent job contacted one minute before midnight is flagged again after midnight', () => {
    const justAfterMidnight = new Date(2026, 8, 16, 0, 1)
    const r = callReason(job({ urgent: true, createdAt: iso(daysAgo(2)), lastContactAt: iso(new Date(2026, 8, 15, 23, 59)) }), justAfterMidnight)
    expect(r?.rule).toBe('equipment-down')
  })

  it('urgent only matters in "Needs quote"', () => {
    const r = callReason(job({ urgent: true, stage: 'Waiting on yes', quoteAmount: 900, lastContactAt: iso(daysAgo(1)) }), NOW)
    expect(r).toBeNull()
  })
})

describe('rule 2: new request', () => {
  it('never-contacted request is "call back"', () => {
    const r = callReason(job({ createdAt: iso(daysAgo(1)) }), NOW)
    expect(r?.rule).toBe('new-request')
    expect(r?.critical).toBe(false)
    expect(r?.waitingDays).toBe(1)
  })

  it('a request that came in a minute ago still shows (nobody waiting is ever hidden)', () => {
    const r = callReason(job({ createdAt: iso(minusMs(NOW, 60_000)) }), NOW)
    expect(r?.rule).toBe('new-request')
    expect(r?.waitingDays).toBe(0)
  })
})

describe('rule 3: send the quote', () => {
  it('contacted but no quote after a day is "Send the quote"', () => {
    const r = callReason(job({ createdAt: iso(daysAgo(3)), lastContactAt: iso(daysAgo(1)) }), NOW)
    expect(r?.rule).toBe('send-quote')
  })

  it('contacted today: nothing due yet', () => {
    const r = callReason(job({ createdAt: iso(daysAgo(3)), lastContactAt: iso(daysAgo(0, 8)) }), NOW)
    expect(r).toBeNull()
  })

  it('boundary: contacted at 23:59 yesterday counts as 1 day; at 00:01 today counts as 0', () => {
    expect(callReason(job({ createdAt: iso(daysAgo(3)), lastContactAt: iso(daysAgo(1, 23, 59)) }), NOW)?.rule).toBe('send-quote')
    expect(callReason(job({ createdAt: iso(daysAgo(3)), lastContactAt: iso(daysAgo(0, 0, 1)) }), NOW)).toBeNull()
  })
})

describe('rule 4: follow up on quote', () => {
  it('quiet for 2+ days is "Follow up on quote"', () => {
    const r = callReason(job({ stage: 'Waiting on yes', quoteAmount: 1800, lastContactAt: iso(daysAgo(3)) }), NOW)
    expect(r?.rule).toBe('follow-up-quote')
    expect(r?.waitingDays).toBe(3)
  })

  it('contacted yesterday is fine', () => {
    const r = callReason(job({ stage: 'Waiting on yes', quoteAmount: 1800, lastContactAt: iso(daysAgo(1)) }), NOW)
    expect(r).toBeNull()
  })

  it('boundary is midnight, not 48 hours: exactly 2 calendar days flags, 1 calendar day does not', () => {
    // Days are calendar days. Mon 23:59 → Wed 09:00 is "2 days" even though it's only 33 hours.
    expect(callReason(job({ stage: 'Waiting on yes', lastContactAt: iso(daysAgo(2, 23, 59)) }), NOW)?.rule).toBe('follow-up-quote')
    // Tue 00:01 → Wed 09:00 is "1 day" (33 hours, but only one midnight crossed).
    expect(callReason(job({ stage: 'Waiting on yes', lastContactAt: iso(daysAgo(1, 0, 1)) }), NOW)).toBeNull()
    // 47h59m and 48h before Wed 09:00 both land on Monday, so both are 2 days.
    expect(callReason(job({ stage: 'Waiting on yes', lastContactAt: iso(minusMs(NOW, 48 * H - 60_000)) }), NOW)?.rule).toBe('follow-up-quote')
    expect(callReason(job({ stage: 'Waiting on yes', lastContactAt: iso(minusMs(NOW, 48 * H)) }), NOW)?.rule).toBe('follow-up-quote')
  })

  it('quote out but never marked as contact falls back to createdAt', () => {
    const r = callReason(job({ stage: 'Waiting on yes', quoteAmount: 500, createdAt: iso(daysAgo(4)), lastContactAt: null }), NOW)
    expect(r?.rule).toBe('follow-up-quote')
    expect(r?.waitingDays).toBe(4)
  })
})

describe('rule 5: book a tech', () => {
  it('approved job always needs booking, even if contacted today', () => {
    const r = callReason(job({ stage: 'Approved – schedule', lastContactAt: iso(daysAgo(0, 8)) }), NOW)
    expect(r?.rule).toBe('book-tech')
    expect(r?.waitingDays).toBe(0)
  })
})

describe('rule 6: confirm job is done', () => {
  it('scheduled date in the past is "Confirm job is done"', () => {
    const r = callReason(job({ stage: 'Scheduled', scheduledFor: toDateKey(daysAgo(2)), lastContactAt: iso(daysAgo(0, 8)) }), NOW)
    expect(r?.rule).toBe('confirm-done')
    expect(r?.waitingDays).toBe(2)
  })

  it('scheduled for today is not past yet; yesterday is', () => {
    const today = job({ stage: 'Scheduled', scheduledFor: toDateKey(NOW), lastContactAt: iso(daysAgo(0, 8)) })
    const yesterday = job({ stage: 'Scheduled', scheduledFor: toDateKey(daysAgo(1)), lastContactAt: iso(daysAgo(0, 8)) })
    expect(callReason(today, NOW)).toBeNull()
    expect(callReason(yesterday, NOW)?.rule).toBe('confirm-done')
  })

  it('scheduled for today stays off the list until midnight, then flags', () => {
    const j = job({ stage: 'Scheduled', scheduledFor: '2026-09-16', lastContactAt: iso(new Date(2026, 8, 16, 8)) })
    expect(callReason(j, new Date(2026, 8, 16, 23, 59, 59))).toBeNull()
    expect(callReason(j, new Date(2026, 8, 17, 0, 0, 1))?.rule).toBe('confirm-done')
  })

  it('scheduled with no date can never be "past"', () => {
    const r = callReason(job({ stage: 'Scheduled', scheduledFor: undefined, lastContactAt: iso(daysAgo(0, 8)) }), NOW)
    expect(r).toBeNull()
  })
})

describe('rule 7: gone quiet', () => {
  it('scheduled for later but quiet for 2+ days', () => {
    const r = callReason(job({ stage: 'Scheduled', scheduledFor: toDateKey(daysAgo(-5)), lastContactAt: iso(daysAgo(4)) }), NOW)
    expect(r?.rule).toBe('no-contact')
    expect(r?.reason).toBe("Hasn't heard from us in 4 days")
  })

  it('healthy scheduled job does not show', () => {
    const r = callReason(job({ stage: 'Scheduled', scheduledFor: toDateKey(daysAgo(-5)), lastContactAt: iso(daysAgo(1)) }), NOW)
    expect(r).toBeNull()
  })
})

describe('never shown', () => {
  it('done and lost jobs never appear, whatever else is true', () => {
    expect(callReason(job({ stage: 'Done', lastContactAt: iso(daysAgo(10)) }), NOW)).toBeNull()
    expect(callReason(job({ stage: 'Done', urgent: true, scheduledFor: toDateKey(daysAgo(3)) }), NOW)).toBeNull()
    expect(callReason(job({ stage: 'Lost', urgent: true }), NOW)).toBeNull()
    expect(callReason(job({ stage: 'Lost', createdAt: iso(daysAgo(30)) }), NOW)).toBeNull()
  })
})

describe('bad or missing data', () => {
  it('createdAt in the future does not crash and reads as today', () => {
    const r = callReason(job({ createdAt: iso(daysAgo(-3)) }), NOW)
    expect(r?.rule).toBe('new-request')
    expect(r?.waitingDays).toBe(0)
  })

  it('lastContactAt in the future does not crash', () => {
    const r = callReason(job({ stage: 'Waiting on yes', lastContactAt: iso(daysAgo(-3)) }), NOW)
    expect(r).toBeNull()
  })

  it('missing optional fields are fine', () => {
    const bare = job({ quoteAmount: undefined, scheduledFor: undefined, history: [], notes: '', businessName: '' })
    expect(callReason(bare, NOW)?.rule).toBe('new-request')
  })

  it('an unparseable createdAt is treated as "no idea, today"', () => {
    const r = callReason(job({ createdAt: 'not a date' }), NOW)
    expect(r?.rule).toBe('new-request')
    expect(Number.isNaN(r?.waitingDays)).toBe(false)
  })
})

describe('callToday list', () => {
  it('empty in, empty out', () => {
    expect(callToday([], NOW)).toEqual([])
  })

  it('each job appears exactly once, under its highest-priority reason', () => {
    // Urgent + never contacted + old: matches rules 1, 2 and 7. Only rule 1 shows.
    const jobs = [job({ id: 'multi', urgent: true, createdAt: iso(daysAgo(5)) })]
    const items = callToday(jobs, NOW)
    expect(items).toHaveLength(1)
    expect(items[0].rule).toBe('equipment-down')
  })

  it('orders by rule priority, then longest waiting first', () => {
    const jobs = [
      job({ id: 'approved', stage: 'Approved – schedule', lastContactAt: iso(daysAgo(0, 8)) }),
      job({ id: 'new-1', createdAt: iso(daysAgo(1)) }),
      job({ id: 'urgent', urgent: true, createdAt: iso(daysAgo(3)) }),
      job({ id: 'new-4', createdAt: iso(daysAgo(4)) }),
      job({ id: 'quote', stage: 'Waiting on yes', lastContactAt: iso(daysAgo(5)) }),
      job({ id: 'healthy', stage: 'Waiting on yes', lastContactAt: iso(daysAgo(1)) }),
      job({ id: 'past', stage: 'Scheduled', scheduledFor: toDateKey(daysAgo(1)), lastContactAt: iso(daysAgo(0, 8)) }),
    ]
    expect(callToday(jobs, NOW).map((i) => i.job.id)).toEqual(['urgent', 'new-4', 'new-1', 'quote', 'approved', 'past'])
  })

  it('is stable: ties keep their input order', () => {
    const jobs = [
      job({ id: 'a', createdAt: iso(daysAgo(2, 9)) }),
      job({ id: 'b', createdAt: iso(daysAgo(2, 15)) }),
      job({ id: 'c', createdAt: iso(daysAgo(2, 11)) }),
    ]
    expect(callToday(jobs, NOW).map((i) => i.job.id)).toEqual(['a', 'b', 'c'])
    expect(callToday([...jobs].reverse(), NOW).map((i) => i.job.id)).toEqual(['c', 'b', 'a'])
  })

  it('does not mutate the input', () => {
    const jobs = [job({ id: 'x', createdAt: iso(daysAgo(1)) }), job({ id: 'y', urgent: true })]
    const copy = jobs.map((j) => ({ ...j }))
    callToday(jobs, NOW)
    expect(jobs).toEqual(copy)
  })
})

describe('timezones', () => {
  const original = process.env.TZ
  afterEach(() => {
    process.env.TZ = original
  })

  // Node picks up TZ changes at runtime, so the same local-time scenario can be checked in several zones.
  for (const tz of ['America/New_York', 'Asia/Kolkata', 'Pacific/Auckland', 'UTC']) {
    it(`calendar-day rules hold in ${tz}`, () => {
      process.env.TZ = tz
      const now = new Date(2026, 8, 16, 0, 30) // 00:30 local, just after midnight
      const lateLastNight = new Date(2026, 8, 15, 23, 45)
      const twoNightsAgo = new Date(2026, 8, 14, 23, 45)
      expect(callReason(job({ stage: 'Waiting on yes', lastContactAt: lateLastNight.toISOString() }), now)).toBeNull()
      expect(callReason(job({ stage: 'Waiting on yes', lastContactAt: twoNightsAgo.toISOString() }), now)?.rule).toBe('follow-up-quote')
      expect(callReason(job({ stage: 'Scheduled', scheduledFor: '2026-09-15', lastContactAt: now.toISOString() }), now)?.rule).toBe('confirm-done')
      expect(callReason(job({ stage: 'Scheduled', scheduledFor: '2026-09-16', lastContactAt: now.toISOString() }), now)).toBeNull()
    })
  }
})

describe('missed calls (added in this build)', () => {
  it('an unreturned missed call outranks a plain new request, but not equipment down', () => {
    const missed = job({ id: 'missed', stage: 'Waiting on yes', lastContactAt: iso(daysAgo(1)), missedCallAt: iso(daysAgo(0, 8)) })
    expect(callReason(missed, NOW)?.rule).toBe('missed-call')
    const jobs = [job({ id: 'new', createdAt: iso(daysAgo(3)) }), missed, job({ id: 'down', urgent: true, createdAt: iso(daysAgo(1)) })]
    expect(callToday(jobs, NOW).map((i) => i.job.id)).toEqual(['down', 'missed', 'new'])
  })

  it('calling them back clears it', () => {
    const j = job({ stage: 'Waiting on yes', missedCallAt: iso(daysAgo(0, 8)), lastContactAt: iso(daysAgo(0, 9)) })
    expect(callReason(j, NOW)).toBeNull()
  })
})

describe('urgent first (spec for this build)', () => {
  it('an urgent job that is due for any reason sorts above non-urgent rows', () => {
    const jobs = [
      job({ id: 'new', createdAt: iso(daysAgo(5)) }),
      job({ id: 'urgent-quote', urgent: true, stage: 'Waiting on yes', lastContactAt: iso(daysAgo(3)) }),
    ]
    expect(callToday(jobs, NOW).map((i) => i.job.id)).toEqual(['urgent-quote', 'new'])
  })
})
