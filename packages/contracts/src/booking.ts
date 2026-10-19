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
  priceMinor: z.string(),
  currency: z.string(),
  locationType: LocationType,
  isActive: z.boolean(),
});
export type ServiceDto = z.infer<typeof ServiceDto>;

const Window = z
  .object({ startLocal: LocalTime, endLocal: LocalTime })
  .refine((w) => w.startLocal < w.endLocal, "window must end after it starts");

export const PutAvailabilityInput = z.object({
  timezone: IanaTimezone,
  weekly: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), windows: z.array(Window).max(6) }))
    .max(7),
  overrides: z.array(z.object({ date: LocalDate, windows: z.array(Window).max(6) })).max(366).default([]),
});
export type PutAvailabilityInput = z.infer<typeof PutAvailabilityInput>;

export const SlotsQuery = z
  .object({
    from: LocalDate,
    to: LocalDate,
    tz: IanaTimezone, // visitor's display timezone
  })
  .refine((q) => q.from <= q.to, "from must be <= to");
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

export const CreateBookingInput = z.object({
  serviceId: z.string(),
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
