import { z } from "zod";
import { Currency, IanaTimezone, LocalDate, LocalTime, MoneyMinor } from "./common";

export const LocationType = z.enum(["VIDEO", "IN_PERSON", "PHONE"]);
export const BookingStatus = z.enum(["PENDING_PAYMENT", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const CreateServiceInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  durationMin: z.number().int().min(10).max(480),
  bufferBeforeMin: z.number().int().min(0).max(120).default(0),
  bufferAfterMin: z.number().int().min(0).max(120).default(0),
  priceMinor: MoneyMinor,
  currency: Currency.default("USD"),
  locationType: LocationType.default("VIDEO"),
  minNoticeMin: z.number().int().min(0).max(60 * 24 * 14).default(720),
  maxAdvanceDays: z.number().int().min(1).max(365).default(60),
  isActive: z.boolean().default(true),
});
export type CreateServiceInput = z.infer<typeof CreateServiceInput>;
export const UpdateServiceInput = CreateServiceInput.partial();

export const ServiceDto = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  durationMin: z.number(),
  bufferBeforeMin: z.number(),
  bufferAfterMin: z.number(),
  priceMinor: z.string(),
  currency: z.string(),
  locationType: LocationType,
  minNoticeMin: z.number(),
  maxAdvanceDays: z.number(),
  isActive: z.boolean(),
});
export type ServiceDto = z.infer<typeof ServiceDto>;

const Window = z
  .object({ startLocal: LocalTime, endLocal: LocalTime })
  .refine((w) => w.startLocal < w.endLocal, "window must end after it starts");

/** Windows within one day must not overlap (touching end-to-start is fine). */
const nonOverlapping = (ws: Array<{ startLocal: string; endLocal: string }>) => {
  const sorted = [...ws].sort((a, b) => a.startLocal.localeCompare(b.startLocal));
  return sorted.every((w, i) => i === 0 || sorted[i - 1]!.endLocal <= w.startLocal);
};
const DayWindows = z.array(Window).max(6).refine(nonOverlapping, "time windows overlap");

export const PutAvailabilityInput = z.object({
  timezone: IanaTimezone,
  weekly: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), windows: DayWindows }))
    .max(7)
    .refine((d) => new Set(d.map((x) => x.weekday)).size === d.length, "each weekday appears once"),
  overrides: z
    .array(z.object({ date: LocalDate, windows: DayWindows }))
    .max(366)
    .default([])
    .refine((d) => new Set(d.map((x) => x.date)).size === d.length, "each date appears once"),
});
export type PutAvailabilityInput = z.infer<typeof PutAvailabilityInput>;

export const SlotsQuery = z
  .object({
    from: LocalDate,
    to: LocalDate,
    tz: IanaTimezone, // visitor's display timezone
  })
  .refine((q) => q.from <= q.to, "from must be <= to")
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 62, "range is limited to 62 days");
export type SlotsQuery = z.infer<typeof SlotsQuery>;

export const Slot = z.object({
  startsAt: z.string(), // ISO UTC
  endsAt: z.string(),
  localDate: z.string(), // in the visitor's tz
  localTime: z.string(),
});
export type Slot = z.infer<typeof Slot>;

export const SlotsResponse = z.object({
  serviceId: z.string(),
  expertTimezone: z.string(),
  displayTimezone: z.string(),
  slots: z.array(Slot),
});
export type SlotsResponse = z.infer<typeof SlotsResponse>;

const WindowDto = z.object({ startLocal: z.string(), endLocal: z.string() });
export const AvailabilityDto = z.object({
  timezone: z.string(),
  weekly: z.array(z.object({ weekday: z.number(), windows: z.array(WindowDto) })),
  overrides: z.array(z.object({ date: z.string(), windows: z.array(WindowDto) })),
});
export type AvailabilityDto = z.infer<typeof AvailabilityDto>;

/** Everything the public booking page needs before it asks for slots. */
export const PublicServicePage = z.object({
  workspace: z.object({ slug: z.string(), name: z.string(), timezone: z.string() }),
  service: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    durationMin: z.number(),
    priceMinor: z.string(),
    currency: z.string(),
    locationType: LocationType,
    minNoticeMin: z.number(),
    maxAdvanceDays: z.number(),
  }),
});
export type PublicServicePage = z.infer<typeof PublicServicePage>;

export const CreateBookingInput = z.object({
  serviceId: z.string(),
  locale: z.enum(["ar", "en"]).default("ar"),
  startsAt: z.string().datetime({ offset: true }),
  customerTz: IanaTimezone,
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().max(30).optional(),
  }),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateBookingInput = z.infer<typeof CreateBookingInput>;

/** Result of holding a slot: pay within the hold, or it is released automatically. */
export const BookingHold = z.object({
  bookingId: z.string(),
  orderId: z.string(),
  status: z.enum(["PENDING_PAYMENT", "CONFIRMED"]),
  checkoutUrl: z.string().nullable(),
  holdExpiresAt: z.string().nullable(),
});
export type BookingHold = z.infer<typeof BookingHold>;

export const BookingDto = z.object({
  id: z.string(),
  serviceId: z.string(),
  serviceTitle: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  customerTz: z.string(),
  status: BookingStatus,
  customer: z.object({ name: z.string().nullable(), email: z.string() }),
  meetingUrl: z.string().nullable(),
});
export type BookingDto = z.infer<typeof BookingDto>;
