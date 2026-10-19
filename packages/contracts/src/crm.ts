import { z } from "zod";
import { PaginationQuery } from "./common";

export const ContactsQuery = PaginationQuery.extend({
  q: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(40).optional(),
  sortBy: z.enum(["lastSeenAt", "lifetimeValueMinor", "firstSeenAt"]).default("lastSeenAt"),
});
export type ContactsQuery = z.infer<typeof ContactsQuery>;

export const ContactDto = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  country: z.string().nullable(),
  tags: z.array(z.string()),
  lifetimeValueMinor: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
});
export type ContactDto = z.infer<typeof ContactDto>;

export const ActivityDto = z.object({
  id: z.string(),
  type: z.string(),
  at: z.string(),
  data: z.record(z.unknown()),
});

export const AnalyticsRange = z.object({ range: z.enum(["7d", "30d", "90d", "365d"]).default("30d") });

export const AnalyticsOverview = z.object({
  range: z.string(),
  currency: z.string(),
  kpis: z.object({
    revenueMinor: z.string(),
    orders: z.number(),
    bookings: z.number(),
    enrollments: z.number(),
    newContacts: z.number(),
    subscribers: z.number(),
  }),
  series: z.array(z.object({ date: z.string(), revenueMinor: z.string(), bookings: z.number(), enrollments: z.number() })),
  topPosts: z.array(z.object({ id: z.string(), title: z.string(), views: z.number(), signups: z.number() })),
  topProducts: z.array(z.object({ id: z.string(), title: z.string(), sales: z.number(), revenueMinor: z.string() })),
});
export type AnalyticsOverview = z.infer<typeof AnalyticsOverview>;
