import { describe, expect, it } from 'vitest'
import { parseMessage } from '@/lib/parse/parseMessage'

describe('website form email', () => {
  it('pulls every field out of a labelled form', () => {
    const r = parseMessage(`New contact form submission

Name: Maria Santos
Business: Santos Taqueria
Phone: 555-234-9876
Equipment: Walk-in freezer
Message: Our walk-in freezer is down since last night, food is thawing. Please call ASAP.`)
    expect(r).toEqual({
      customerName: 'Maria Santos',
      businessName: 'Santos Taqueria',
      phone: '(555) 234-9876',
      equipment: 'walk-in freezer',
      urgent: true,
      issue: 'Our walk-in freezer is down since last night, food is thawing. Please call ASAP.',
      source: 'web form',
    })
  })

  it('handles a form with only some fields and a lowercase label style', () => {
    const r = parseMessage(`name: bob ray\nphone: 5551239999\nmessage: ice maker leaking, no rush`)
    expect(r.customerName).toBe('bob ray')
    expect(r.phone).toBe('(555) 123-9999')
    expect(r.equipment).toBe('ice machine')
    expect(r.urgent).toBe(false)
    expect(r.issue).toBe('ice maker leaking, no rush')
  })
})

describe('casual text messages', () => {
  it('parses "this is X from Y"', () => {
    const r = parseMessage('Hi this is Jake from Harbor Grill, our ice machine stopped making ice yesterday. Can someone come look? 555.402.1188')
    expect(r.customerName).toBe('Jake')
    expect(r.businessName).toBe('Harbor Grill')
    expect(r.phone).toBe('(555) 402-1188')
    expect(r.equipment).toBe('ice machine')
    expect(r.source).toBe('text')
  })

  it('picks up a signature name', () => {
    const r = parseMessage('Hey, looking to get a quote on a quarterly cleaning for two reach-in coolers. Thanks, Dana (555) 777-1234')
    expect(r.urgent).toBe(false)
    expect(r.equipment).toBe('reach-in')
    expect(r.customerName).toBe('Dana')
    expect(r.phone).toBe('(555) 777-1234')
  })

  it('leaves name and business blank when there is nothing to go on', () => {
    const r = parseMessage('cooler is warm call me 5551112222')
    expect(r.customerName).toBeUndefined()
    expect(r.businessName).toBeUndefined()
    expect(r.phone).toBe('(555) 111-2222')
    expect(r.urgent).toBe(true)
  })
})

describe('phone numbers', () => {
  const cases: Array<[string, string]> = [
    ['(555) 123-4567', '(555) 123-4567'],
    ['555-123-4567', '(555) 123-4567'],
    ['555.123.4567', '(555) 123-4567'],
    ['+1 555 123 4567', '(555) 123-4567'],
    ['1-555-123-4567', '(555) 123-4567'],
    ['5551234567', '(555) 123-4567'],
    ['+91 98765 43210', '+91 98765 43210'],
    ['+91-9876543210', '+91 98765 43210'],
    ['+919876543210', '+91 98765 43210'],
    ['98765 43210', '98765 43210'],
  ]
  for (const [input, expected] of cases) {
    it(`formats ${input}`, () => {
      expect(parseMessage(`call me at ${input} please`).phone).toBe(expected)
    })
  }

  it('no phone means no phone', () => {
    expect(parseMessage('freezer is broken, email me back').phone).toBeUndefined()
  })

  it('two numbers: takes the first, does not merge them', () => {
    const r = parseMessage('Office 555-100-2000, or my cell 555-300-4000 after 5')
    expect(r.phone).toBe('(555) 100-2000')
  })

  it('does not mistake a dollar amount or a date for a phone', () => {
    expect(parseMessage('quoted $1,850 on 2026-09-16, still waiting').phone).toBeUndefined()
  })

  it('a Phone: field wins over a number in the body', () => {
    const r = parseMessage('Phone: 555-999-0000\nMessage: my old number 555-111-1111 is disconnected')
    expect(r.phone).toBe('(555) 999-0000')
  })
})

describe('urgency', () => {
  it.each(['FREEZER DOWN', 'it is not cooling', 'this is an EMERGENCY', 'the walk-in is warm', 'Ice machine dead', 'stopped working overnight'])(
    'flags "%s"',
    (text) => {
      expect(parseMessage(text).urgent).toBe(true)
    },
  )

  it.each(['We are downtown on 5th', 'please download the invoice', 'quarterly service when you get a chance', 'the door gasket is torn'])(
    'does not flag "%s"',
    (text) => {
      expect(parseMessage(text).urgent).toBe(false)
    },
  )

  it('an explicit "not urgent" / "no rush" wins over scary words', () => {
    // Decision: if the customer says it isn't urgent, believe them. Denise can tick the box herself.
    expect(parseMessage('Freezer is running warm but not urgent, whenever you can').urgent).toBe(false)
    expect(parseMessage('Cooler down in the back, no rush though').urgent).toBe(false)
    expect(parseMessage('Ice machine broken. Not an emergency.').urgent).toBe(false)
  })
})

describe('equipment', () => {
  it.each<[string, string]>([
    ['our walk-in freezer is frosting up', 'walk-in freezer'],
    ['the freezer quit', 'walk-in freezer'],
    ['walk-in cooler holding 45', 'walk-in cooler'],
    ['the walk in is warm', 'walk-in cooler'],
    ['cooler running warm', 'walk-in cooler'],
    ['ice machine making small cubes', 'ice machine'],
    ['ice maker leaking', 'ice machine'],
    ['reach-in freezer door gasket', 'reach-in'],
    ['reach in cooler not cold', 'reach-in'],
    ['beverage cooler by the register', 'reach-in'],
    ['the display case is fogging', 'reach-in'],
    ['fridge is loud', 'walk-in cooler'],
  ])('"%s" → %s', (text, expected) => {
    expect(parseMessage(text).equipment).toBe(expected)
  })

  it('takes the first piece of equipment mentioned when there are several', () => {
    expect(parseMessage('ice machine and the walk-in freezer both acting up').equipment).toBe('ice machine')
    expect(parseMessage('walk-in freezer and the ice machine both acting up').equipment).toBe('walk-in freezer')
  })

  it('is undefined when nothing refrigeration-related is mentioned', () => {
    expect(parseMessage('can you send me an invoice for last month').equipment).toBeUndefined()
  })
})

describe('junk and edge cases', () => {
  it('empty and whitespace-only input gives an empty result', () => {
    expect(parseMessage('')).toEqual({})
    expect(parseMessage('   \n\t  ')).toEqual({})
  })

  it('emojis do not break anything', () => {
    const r = parseMessage('🧊 ice machine down 😱 call Rosa 555-222-3333 🙏')
    expect(r.equipment).toBe('ice machine')
    expect(r.urgent).toBe(true)
    expect(r.phone).toBe('(555) 222-3333')
  })

  it('HTML in the paste is stripped and entities decoded', () => {
    const r = parseMessage('<div><b>Name:</b> Tom &amp; Jerry</div><br><p>Phone: (555) 123-4567</p><p>Message: freezer is down &quot;again&quot;</p>')
    expect(r.customerName).toBe('Tom & Jerry')
    expect(r.phone).toBe('(555) 123-4567')
    expect(r.issue).toBe('freezer is down "again"')
    expect(r.urgent).toBe(true)
  })

  it('a 5,000 character paste is handled quickly and the issue is capped', () => {
    const long = 'Name: Big Talker\nPhone: 555-000-1111\nMessage: ' + 'the cooler is warm and '.repeat(250)
    expect(long.length).toBeGreaterThan(5000)
    const start = performance.now()
    const r = parseMessage(long)
    expect(performance.now() - start).toBeLessThan(200)
    expect(r.customerName).toBe('Big Talker')
    expect(r.issue!.length).toBeLessThanOrEqual(240)
    expect(r.urgent).toBe(true)
  })

  it('never throws on weird input', () => {
    const nul = String.fromCharCode(0)
    const weird = [nul + nul, '\\', '(((((', 'Name:', ':', '::::', '<<<>>>', '&&&;;;', 'a'.repeat(100_000), '📞'.repeat(1000)]
    for (const w of weird) expect(() => parseMessage(w)).not.toThrow()
    // Non-strings from a buggy caller get coerced, not thrown at.
    expect(() => parseMessage(null as unknown as string)).not.toThrow()
    expect(() => parseMessage(undefined as unknown as string)).not.toThrow()
    expect(() => parseMessage(42 as unknown as string)).not.toThrow()
  })
})
