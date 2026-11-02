import { z } from "zod";
import { BookingStatus } from "./booking";
import { PaginationQuery } from "./common";
import { OrderStatus } from "./pay";

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
export type ActivityDto = z.infer<typeof ActivityDto>;

/** Private to the expert's workspace; the client never sees notes. */
export const CreateContactNoteInput = z.object({ body: z.string().trim().min(1).max(5000) });
export type CreateContactNoteInput = z.infer<typeof CreateContactNoteInput>;

export const ContactNoteDto = z.object({ id: z.string(), body: z.string(), author: z.string(), createdAt: z.string() });
export type ContactNoteDto = z.infer<typeof ContactNoteDto>;

export const ContactDetailDto = z.object({
  contact: ContactDto,
  bookings: z.array(z.object({ id: z.string(), serviceTitle: z.string(), startsAt: z.string(), status: BookingStatus })),
  orders: z.array(z.object({ id: z.string(), status: OrderStatus, subtotalMinor: z.string(), currency: z.string(), items: z.array(z.string()), paidAt: z.string().nullable() })),
  activity: z.array(ActivityDto),
  notes: z.array(ContactNoteDto),
});
export type ContactDetailDto = z.infer<typeof ContactDetailDto>;

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
