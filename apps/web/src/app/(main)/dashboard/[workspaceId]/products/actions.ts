"use server";

import type { ProductDetailDto, UploadTicket } from "@tashkeel/contracts";
import { parseMajor } from "@tashkeel/core";
import { getDictionary } from "@tashkeel/i18n";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

export type ProductFormState = { ok?: boolean; error?: string };
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}/products`;

async function call<T>(fn: (token: string) => Promise<T>): Promise<Result<T>> {
  const { token } = await requireSession();
  const locale = await getLocale();
  try {
    return { ok: true, data: await fn(token) };
  } catch (e) {
    return { ok: false, error: errorMessage(e, locale, getDictionary(locale).auth.failed) };
  }
}

/** Product pages are part of the public home, so its cached page is refreshed as well. */
function refresh(workspaceId: string, slug: string, productId?: string) {
  revalidateTag(`home:${slug}`);
  revalidatePath(`/dashboard/${workspaceId}/products`);
  if (productId) revalidatePath(`/dashboard/${workspaceId}/products/${productId}`);
}

function fields(form: FormData) {
  const description = String(form.get("description") ?? "").trim();
  return {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? "").trim().toLowerCase(),
    ...(description ? { description } : {}),
    priceMinor: parseMajor(String(form.get("price") || "0"), "USD").toString(),
    currency: "USD",
  };
}

export async function createProduct(workspaceId: string, slug: string, _prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  let body: ReturnType<typeof fields>;
  try {
    body = fields(form);
  } catch {
    return { error: (await getLocale()) === "ar" ? "السعر غير صالح" : "Invalid price" };
  }
  const r = await call((token) => api<ProductDetailDto>(base(workspaceId), { token, method: "POST", body }));
  if (!r.ok) return { error: r.error };
  refresh(workspaceId, slug);
  redirect(`/dashboard/${workspaceId}/products/${r.data.id}`);
}

export async function updateProduct(workspaceId: string, slug: string, productId: string, _prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  let body: ReturnType<typeof fields>;
  try {
    body = fields(form);
  } catch {
    return { error: (await getLocale()) === "ar" ? "السعر غير صالح" : "Invalid price" };
  }
  const r = await call((token) => api<ProductDetailDto>(`${base(workspaceId)}/${productId}`, { token, method: "PATCH", body }));
  if (!r.ok) return { error: r.error };
  refresh(workspaceId, slug, productId);
  return { ok: true };
}

export async function setStatus(workspaceId: string, slug: string, productId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED"): Promise<Result<ProductDetailDto>> {
  const r = await call((token) => api<ProductDetailDto>(`${base(workspaceId)}/${productId}`, { token, method: "PATCH", body: { status } }));
  if (r.ok) refresh(workspaceId, slug, productId);
  return r;
}

/** Step 1 of an upload: a signed URL the browser PUTs the file to directly. */
export async function requestFileUpload(workspaceId: string, productId: string, file: { fileName: string; mime: string; sizeBytes: number }): Promise<Result<UploadTicket>> {
  return call((token) => api<UploadTicket>(`${base(workspaceId)}/${productId}/files`, { token, method: "POST", body: file }));
}

/** Step 3: the API checks the stored size and marks the file as uploaded. */
export async function completeFileUpload(workspaceId: string, slug: string, productId: string, fileId: string): Promise<Result<ProductDetailDto>> {
  const r = await call((token) => api<ProductDetailDto>(`${base(workspaceId)}/${productId}/files/${fileId}/complete`, { token, method: "POST" }));
  if (r.ok) refresh(workspaceId, slug, productId);
  return r;
}

export async function deleteFile(workspaceId: string, slug: string, productId: string, fileId: string): Promise<Result<ProductDetailDto>> {
  const r = await call((token) => api<ProductDetailDto>(`${base(workspaceId)}/${productId}/files/${fileId}`, { token, method: "DELETE" }));
  if (r.ok) refresh(workspaceId, slug, productId);
  return r;
}

export async function requestCoverUpload(workspaceId: string, productId: string, file: { mime: string; sizeBytes: number }): Promise<Result<UploadTicket>> {
  return call((token) => api<UploadTicket>(`${base(workspaceId)}/${productId}/cover`, { token, method: "POST", body: file }));
}

export async function completeCoverUpload(workspaceId: string, slug: string, productId: string, key: string): Promise<Result<ProductDetailDto>> {
  const r = await call((token) => api<ProductDetailDto>(`${base(workspaceId)}/${productId}/cover/complete`, { token, method: "POST", body: { key } }));
  if (r.ok) refresh(workspaceId, slug, productId);
  return r;
}
