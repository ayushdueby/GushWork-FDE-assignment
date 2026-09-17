/** Realistic inbound samples for the "Simulate incoming …" buttons and the E2E tests. */

export interface SampleMessage {
  key: string;
  label: string;
  channel: "email" | "sms";
  from: string;
  subject?: string;
  body: string;
}

export const EMAIL_SAMPLES: SampleMessage[] = [
  {
    key: "email-urgent",
    label: "New urgent request (walk-in freezer down)",
    channel: "email",
    from: "Maria Santos <maria@santostaqueria.com>",
    subject: "Walk-in freezer down — need someone today",
    body: "Hi,\n\nOur walk-in freezer at Santos Taqueria stopped cooling overnight. It's reading 30°F and climbing and we have a full weekend of product in there. Can you send someone today?\n\nMaria Santos\nSantos Taqueria, 2211 S Lamar Blvd\n512-555-0231",
  },
  {
    key: "email-maintenance",
    label: "Routine maintenance request",
    channel: "email",
    from: "ops@hillcountrymarket.com",
    subject: "Quarterly service for two walk-ins",
    body: "Hello,\n\nWe'd like to set up quarterly coil cleaning and a check-up on both walk-in coolers at Hill Country Market. No rush — sometime in the next few weeks is fine. Please send a quote.\n\nThanks,\nDerek Hollis\nHill Country Market\n(512) 555-0244",
  },
  {
    key: "email-webform",
    label: "Website form submission (reach-in warm)",
    channel: "email",
    from: "website@denisesrefrigeration.com",
    subject: "New website request",
    body: "Name: Angela Ruiz\nBusiness: The Rolling Pin Bakery\nPhone: 512-555-0266\nEmail: angela@rollingpinatx.com\nEquipment: Reach-in\nMessage: Our reach-in cooler is running warm, about 48 degrees. Not an emergency but we'd like it looked at this week.",
  },
  {
    key: "email-accept",
    label: "Quote acceptance from Big Sky Grocery",
    channel: "email",
    from: "tom@bigskygrocery.com",
    subject: "Re: Quote for Northside walk-in",
    body: "Denise — looked over the quote, that's fine. Go ahead and schedule it. Mornings work best for us.\n\nTom",
  },
  {
    key: "email-scheduling",
    label: "Scheduling reply from The Copper Kettle",
    channel: "email",
    from: "owen@copperkettleatx.com",
    subject: "Re: Freezer door heater",
    body: "Any weekday after 2pm works for us. Thursday would be ideal if you have someone free.\n\nOwen",
  },
  {
    key: "email-spam",
    label: "Spam (SEO pitch)",
    channel: "email",
    from: "growth@rankfast-seo.example",
    subject: "Get your refrigeration company to #1 on Google",
    body: "Hi there! Our SEO experts can get your business ranking #1 on Google in 30 days, guaranteed. Reply now for a free audit and limited offer. Unsubscribe here.",
  },
];

export const SMS_SAMPLES: SampleMessage[] = [
  {
    key: "sms-urgent",
    label: "New urgent request (ice machine dead)",
    channel: "sms",
    from: "(512) 555-0288",
    body: "Hi this is Jake from Harbor Grill, our ice machine died this morning and we open at 11. Can someone come look today? 512-555-0288",
  },
  {
    key: "sms-repeat",
    label: "Repeat customer (Northside Diner) — new problem",
    channel: "sms",
    from: "(512) 555-0111",
    body: "Hey Denise, Gus at Northside Diner. Now the walk-in is running warm too, holding about 44. Not down yet but getting there. Can you add it to Marcus's visit?",
  },
  {
    key: "sms-accept",
    label: "Quote acceptance (Lakeside Grill)",
    channel: "sms",
    from: "(512) 555-0177",
    body: "Yes let's do it, go ahead with the ice machine quote. - Priya",
  },
  {
    key: "sms-decline",
    label: "Quote declined (Sushi Zen)",
    channel: "sms",
    from: "(512) 555-0195",
    body: "Thanks for the quote but we're going to pass, too expensive for us right now. Kenji",
  },
  {
    key: "sms-scheduling",
    label: "Scheduling reply (Pho 88)",
    channel: "sms",
    from: "(512) 555-0162",
    body: "Tuesday morning at 9 works for us. See you then!",
  },
  {
    key: "sms-spam",
    label: "Spam (crypto)",
    channel: "sms",
    from: "(917) 555-0000",
    body: "CONGRATS! You've been selected for a guaranteed crypto loan. Reply YES to claim your limited offer.",
  },
];

export function findSample(key: string): SampleMessage | undefined {
  return [...EMAIL_SAMPLES, ...SMS_SAMPLES].find((s) => s.key === key);
}
