"use server";

import type { PutAvailabilityInput, ServiceDto } from "@tashkeel/contracts";
import { parseMajor } from "@tashkeel/core";
import { revalidatePath, revalidateTag } from "next/cache";
import { api, errorMessage } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

export type Result = { ok: true } | { ok: false; error: string };

export type ServiceForm = {
  title: string;
  description: string;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  price: string; // major units, USD
  locationType: "VIDEO" | "IN_PERSON" | "PHONE";
  minNoticeHours: number;
  maxAdvanceDays: number;
  isActive: boolean;
};

async function run(fn: (token: string) => Promise<unknown>, slug: string, path: string): Promise<Result> {
  const { token } = await requireSession();
  const locale = await getLocale();
  try {
    await fn(token);
  } catch (e) {
    return { ok: false, error: errorMessage(e, locale, locale === "ar" ? "تعذّر الحفظ، تحقق من الحقول" : "Could not save, check the fields") };
  }
  // Services are listed on the public home, so its cached page is refreshed too.
  revalidateTag(`home:${slug}`);
  revalidatePath(path);
  return { ok: true };
}

function toBody(f: ServiceForm) {
  return {
    title: f.title,
    ...(f.description ? { description: f.description } : {}),
    durationMin: f.durationMin,
    bufferBeforeMin: f.bufferBeforeMin,
    bufferAfterMin: f.bufferAfterMin,
    priceMinor: parseMajor(f.price || "0", "USD").toString(),
    currency: "USD",
    locationType: f.locationType,
    minNoticeMin: Math.round(f.minNoticeHours * 60),
    maxAdvanceDays: f.maxAdvanceDays,
    isActive: f.isActive,
  };
}

export async function saveService(workspaceId: string, slug: string, serviceId: string | null, form: ServiceForm): Promise<Result> {
  let body: ReturnType<typeof toBody>;
  try {
    body = toBody(form);
  } catch {
    const locale = await getLocale();
    return { ok: false, error: locale === "ar" ? "السعر غير صالح" : "Invalid price" };
  }
  const path = `/dashboard/${workspaceId}/services`;
  return run(
    (token) =>
      serviceId
        ? api<ServiceDto>(`/v1/workspaces/${workspaceId}/services/${serviceId}`, { token, method: "PATCH", body })
        : api<ServiceDto>(`/v1/workspaces/${workspaceId}/services`, { token, method: "POST", body }),
    slug,
    path,
  );
}

export async function saveAvailability(workspaceId: string, slug: string, input: PutAvailabilityInput): Promise<Result> {
  return run((token) => api(`/v1/workspaces/${workspaceId}/availability`, { token, method: "PUT", body: input }), slug, `/dashboard/${workspaceId}/availability`);
}
