import type { Dictionary } from "./ar";

type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly Widen<U>[] : { [K in keyof T]: Widen<T[K]> };

export const en: Widen<Dictionary> = {
  meta: {
    title: "Tashkeel — the digital home for Arab experts",
    description: "One link you own for your identity, consultations, digital products, courses, writing and clients — with Tashkeel Pay for global payments.",
  },
  nav: { features: "Features", pay: "Tashkeel Pay", pricing: "Pricing", login: "Log in", start: "Start free" },
  hero: {
    eyebrow: "The digital home for experts and consultants",
    title: "Your expertise deserves a home you own, not rented land.",
    lead: "Tashkeel brings your identity, consultations, digital products, courses, writing and clients into one beautifully editorial link — and pays you wherever you are.",
    primary: "Claim your link",
    secondary: "Explore the pillars",
    slugPrefix: "tashkeel.app/",
    slugPlaceholder: "yourname",
  },
  problem: {
    index: "01",
    eyebrow: "The problem",
    title: "Your audience lives on platforms you don't own, and your business is split across ten tools.",
    points: [
      { title: "Rented land", body: "One algorithm change can erase years of audience building." },
      { title: "Tool sprawl", body: "A booking link here, a store there, a spreadsheet of clients, endless DMs." },
      { title: "Payment walls", body: "Your clients are global, but getting paid in Syria, Lebanon or Iraq is hard." },
    ],
  },
  pillars: {
    index: "02",
    eyebrow: "Pillars",
    title: "Everything a knowledge business needs, in one place.",
    items: [
      {
        k: "home",
        title: "Digital home",
        body: "One link you own for your identity and everything you offer, in a calm editorial design that reads Arabic-first.",
        points: ["Ready-made sections arranged by drag and drop", "Warm, customisable themes", "Draft and publish without touching the live page"],
      },
      {
        k: "consult",
        title: "Consultations",
        body: "Clients book in their own time zone and pay before the session; you receive a confirmed booking.",
        points: ["Weekly availability plus date exceptions", "Automatic time-zone conversion", "Double booking prevented at the database level"],
      },
      {
        k: "assets",
        title: "Digital products & courses",
        body: "Sell ebooks, guides and templates, and teach courses in modules and lessons, with access tied to purchase.",
        points: ["Secure, expiring download links after payment", "Modules and lessons with free previews", "Progress tracking for every student"],
      },
      {
        k: "blog",
        title: "Editorial blog",
        body: "Publish on your own home, not someone else's platform, and turn readers into a newsletter you own.",
        points: ["Fully Arabic-capable editor", "Search-engine and social-sharing ready", "Explicit-consent email sign-up"],
      },
      {
        k: "crm",
        title: "Clients & numbers",
        body: "One record per client across purchases, bookings and courses, and your business numbers as they are.",
        points: ["Activity timeline for every client", "Gross, fees and net for every sale", "Role-based access for your team"],
      },
    ],
  },
  pay: {
    index: "03",
    eyebrow: "Tashkeel Pay",
    title: "Get paid from anywhere. Receive where you are.",
    lead: "Clients pay by card through Stripe; we deliver your earnings over trusted rails that work in your country.",
    rails: ["Al Baraka Bank", "Sham Cash", "Digital wallets", "International wire"],
    points: [
      "A double-entry ledger for every transaction — your balance is exact to the cent.",
      "A short hold covers refunds, then funds become withdrawable.",
      "Payout requests with live status tracking and a receipt for every transfer.",
    ],
  },
  steps: {
    index: "04",
    eyebrow: "How it works",
    title: "Three steps between your expertise and your first client.",
    items: [
      { title: "Claim your link", body: "Pick a short name for your digital home." },
      { title: "Shape your page", body: "Add your bio, services and products from on-brand templates." },
      { title: "Share and get paid", body: "Put the link everywhere and take bookings and payments automatically." },
    ],
  },
  pricing: {
    index: "05",
    eyebrow: "Pricing",
    title: "Simple subscription, fees that shrink as you grow.",
    perMonth: "/ month",
    fee: "transaction fee",
    cta: "Choose plan",
    popular: "Most popular",
    plans: [
      { code: "FREE", name: "Starter", price: "0", fee: "8%", features: ["Full digital home", "Unlimited bookings & products", "Tashkeel Pay"] },
      { code: "PRO", name: "Pro", price: "29", fee: "4%", features: ["Everything in Starter", "Courses & blog", "Custom domain", "Advanced analytics"] },
      { code: "BUSINESS", name: "Business", price: "79", fee: "1.5%", features: ["Everything in Pro", "Team & roles", "Priority support & payouts"] },
    ],
  },
  cta: { title: "Start building your digital home today.", body: "Free, no credit card required.", button: "Start free" },
  footer: { tagline: "Turning expertise into an asset you own and grow.", rights: "All rights reserved." },
  home: { poweredBy: "Made with Tashkeel", notFound: "We couldn't find this page", back: "Back home" },
};
