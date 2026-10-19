import { describe, expect, it } from "vitest";
import { CreateBookingInput, CreateWorkspaceInput, PageBlocks, PayoutDetails, PutAvailabilityInput, Slug, UpsertPostInput } from "./index";

describe("contracts", () => {
  it("validates slugs and blocks reserved words", () => {
    expect(Slug.safeParse("dr-sara").success).toBe(true);
    expect(Slug.safeParse("Dr Sara").success).toBe(false);
    expect(Slug.safeParse("admin").success).toBe(false);
  });

  it("applies workspace defaults and rejects bad timezones", () => {
    expect(CreateWorkspaceInput.parse({ name: "سارة", slug: "sara" })).toMatchObject({ timezone: "Asia/Riyadh", currency: "USD" });
    expect(CreateWorkspaceInput.safeParse({ name: "سارة", slug: "sara", timezone: "Mars/Base" }).success).toBe(false);
  });

  it("parses page blocks with defaults and rejects duplicate ids", () => {
    const blocks = PageBlocks.parse([
      { id: "h", type: "hero", props: { title: "مرحباً" } },
      { id: "s", type: "services", props: {} },
    ]);
    expect(blocks[0]).toMatchObject({ type: "hero", props: { layout: "split" } });
    expect(blocks[1]).toMatchObject({ props: { heading: "الاستشارات" } });
    expect(PageBlocks.safeParse([{ id: "a", type: "faq", props: { items: [] } }, { id: "a", type: "faq", props: { items: [] } }]).success).toBe(false);
    expect(PageBlocks.safeParse([{ id: "x", type: "script", props: {} }]).success).toBe(false);
  });

  it("rejects inverted availability windows", () => {
    expect(PutAvailabilityInput.safeParse({ timezone: "Asia/Damascus", weekly: [{ weekday: 1, windows: [{ startLocal: "17:00", endLocal: "09:00" }] }] }).success).toBe(false);
  });

  it("requires an offset on booking times", () => {
    const base = { serviceId: "s", customerTz: "Europe/Berlin", customer: { name: "Ali", email: "a@b.co" } };
    expect(CreateBookingInput.safeParse({ ...base, startsAt: "2026-10-20T06:00:00Z" }).success).toBe(true);
    expect(CreateBookingInput.safeParse({ ...base, startsAt: "2026-10-20 06:00" }).success).toBe(false);
  });

  it("requires publishAt when scheduling a post", () => {
    expect(UpsertPostInput.safeParse({ slug: "مقال", title: "مقال أول", bodyMd: "x", status: "SCHEDULED" }).success).toBe(false);
  });

  it("validates per-method payout details", () => {
    expect(PayoutDetails.safeParse({ method: "SHAM_CASH", fullName: "سارة أحمد", walletId: "SC123456", phone: "+963900000000" }).success).toBe(true);
    expect(PayoutDetails.safeParse({ method: "AL_BARAKA", accountHolder: "x", accountNumber: "1" }).success).toBe(false);
  });
});

describe("courses block", () => {
  it("is a first-class block with an Arabic default heading", () => {
    expect(PageBlocks.parse([{ id: "c", type: "courses", props: {} }])[0]).toMatchObject({ props: { heading: "الدورات" } });
  });
});

describe("availability", () => {
  it("rejects overlapping windows and duplicate weekdays", () => {
    const w = (startLocal: string, endLocal: string) => ({ startLocal, endLocal });
    expect(PutAvailabilityInput.safeParse({ timezone: "Asia/Riyadh", weekly: [{ weekday: 1, windows: [w("09:00", "12:00"), w("12:00", "14:00")] }] }).success).toBe(true);
    expect(PutAvailabilityInput.safeParse({ timezone: "Asia/Riyadh", weekly: [{ weekday: 1, windows: [w("09:00", "12:00"), w("11:00", "14:00")] }] }).success).toBe(false);
    expect(PutAvailabilityInput.safeParse({ timezone: "Asia/Riyadh", weekly: [{ weekday: 1, windows: [] }, { weekday: 1, windows: [] }] }).success).toBe(false);
  });
});
