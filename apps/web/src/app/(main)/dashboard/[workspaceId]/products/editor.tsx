"use client";

import { ALLOWED_COVER_MIME, ALLOWED_FILE_MIME, MAX_COVER_BYTES, MAX_FILE_BYTES, type ProductDetailDto, type UploadTicket } from "@tashkeel/contracts";
import type { Dictionary } from "@tashkeel/i18n";
import { cx } from "@tashkeel/ui";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  completeCoverUpload,
  completeFileUpload,
  deleteFile,
  requestCoverUpload,
  requestFileUpload,
  setStatus,
  type ProductFormState,
  type Result,
} from "./actions";

type T = Dictionary["dash"]["product"];
type Action = (s: ProductFormState, f: FormData) => Promise<ProductFormState>;

const input = "w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm focus:border-accent focus:outline-none";

function Alert({ error }: { error?: string | null }) {
  return error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p> : null;
}

const size = (bytes: string | number) => {
  const n = Number(bytes);
  return n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

/** Name, link, price and description. Used for both the new-product page and the editor. */
export function ProductForm({ action, t, initial, submit }: { action: Action; t: T; initial?: ProductDetailDto; submit: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-4">
      <label className="grid gap-1.5 text-sm">
        <span className="font-heading text-xs text-muted">{t.title}</span>
        <input name="title" required minLength={2} maxLength={160} defaultValue={initial?.title} className={input} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-heading text-xs text-muted">{t.slug}</span>
          <input name="slug" required maxLength={80} pattern="[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?" dir="ltr" defaultValue={initial?.slug} className={input} />
          <span className="text-xs text-muted">{t.slugHint}</span>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-heading text-xs text-muted">{t.price}</span>
          <input name="price" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" dir="ltr" placeholder="0" defaultValue={initial ? (Number(initial.priceMinor) / 100).toString() : ""} className={input} />
          <span className="text-xs text-muted">{t.priceHint}</span>
        </label>
      </div>
      <label className="grid gap-1.5 text-sm">
        <span className="font-heading text-xs text-muted">{t.description}</span>
        <textarea name="description" rows={5} maxLength={10000} defaultValue={initial?.description ?? ""} className={cx(input, "leading-7")} />
      </label>
      <Alert error={state.error} />
      {state.ok && <p role="status" className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{t.saved}</p>}
      <button disabled={pending} className="justify-self-start rounded-full bg-ink px-6 py-2.5 font-heading text-sm text-paper disabled:opacity-60">{submit}</button>
    </form>
  );
}

/** Signed URL → direct PUT to storage → confirmation. File bytes never pass through our servers. */
async function putToStorage(ticket: Result<UploadTicket>, file: File, failed: string): Promise<Result<UploadTicket>> {
  if (!ticket.ok) return ticket;
  try {
    const res = await fetch(ticket.data.uploadUrl, { method: "PUT", headers: { "content-type": ticket.data.mime }, body: file });
    return res.ok ? ticket : { ok: false, error: failed };
  } catch {
    return { ok: false, error: failed };
  }
}

export function FilesPanel({ product, workspaceId, slug, t }: { product: ProductDetailDto; workspaceId: string; slug: string; t: T }) {
  const [files, setFiles] = useState(product.files);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  const upload = (file: File) =>
    start(async () => {
      setError(null);
      if (file.size > MAX_FILE_BYTES) return setError(t.tooBig);
      if (!(ALLOWED_FILE_MIME as readonly string[]).includes(file.type)) return setError(t.badType);
      const ticket = await putToStorage(await requestFileUpload(workspaceId, product.id, { fileName: file.name, mime: file.type, sizeBytes: file.size }), file, t.uploadFailed);
      if (!ticket.ok) return setError(ticket.error);
      const done = await completeFileUpload(workspaceId, slug, product.id, ticket.data.fileId);
      if (!done.ok) return setError(done.error);
      setFiles(done.data.files);
    });

  const remove = (fileId: string) =>
    start(async () => {
      setError(null);
      const r = await deleteFile(workspaceId, slug, product.id, fileId);
      if (!r.ok) return setError(r.error);
      setFiles(r.data.files);
    });

  return (
    <div className="grid gap-4">
      <p className="text-xs leading-6 text-muted">{t.filesHint}</p>
      {files.length === 0 ? (
        <p className="text-sm text-muted">{t.noFiles}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 break-all">{f.fileName}</span>
              <span className="flex items-center gap-3 text-xs text-muted">
                {f.uploaded ? <span dir="ltr">{size(f.sizeBytes)}</span> : <span className="text-amber-800">{t.pending}</span>}
                <button type="button" disabled={busy} onClick={() => remove(f.id)} className="hover:text-ink disabled:opacity-50">{t.remove}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Alert error={error} />
      <input ref={picker} type="file" hidden accept={ALLOWED_FILE_MIME.join(",")} onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) upload(file);
      }} />
      <button type="button" disabled={busy} onClick={() => picker.current?.click()} className="justify-self-start rounded-full border border-dashed border-accent/60 px-5 py-2.5 font-heading text-sm text-accent hover:bg-sand disabled:opacity-60">
        {busy ? t.uploading : `+ ${t.upload}`}
      </button>
    </div>
  );
}

export function CoverPanel({ product, workspaceId, slug, t }: { product: ProductDetailDto; workspaceId: string; slug: string; t: T }) {
  const [url, setUrl] = useState(product.coverUrl);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  const upload = (file: File) =>
    start(async () => {
      setError(null);
      if (file.size > MAX_COVER_BYTES) return setError(t.tooBig);
      if (!(ALLOWED_COVER_MIME as readonly string[]).includes(file.type)) return setError(t.badType);
      const ticket = await putToStorage(await requestCoverUpload(workspaceId, product.id, { mime: file.type, sizeBytes: file.size }), file, t.uploadFailed);
      if (!ticket.ok) return setError(ticket.error);
      const done = await completeCoverUpload(workspaceId, slug, product.id, ticket.data.fileId);
      if (!done.ok) return setError(done.error);
      setUrl(done.data.coverUrl);
    });

  return (
    <div className="grid gap-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed redirect from our API, not a static asset
        <img src={url} alt="" className="aspect-[4/3] w-full rounded-xl border border-line object-cover" />
      ) : (
        <div className="grid aspect-[4/3] w-full place-items-center rounded-xl border border-dashed border-line bg-sand text-xs text-muted">{t.coverHint}</div>
      )}
      <Alert error={error} />
      <input ref={picker} type="file" hidden accept={ALLOWED_COVER_MIME.join(",")} onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) upload(file);
      }} />
      <button type="button" disabled={busy} onClick={() => picker.current?.click()} className="justify-self-start rounded-full border border-ink/20 px-4 py-2 font-heading text-sm hover:border-ink/50 disabled:opacity-60">
        {busy ? t.uploading : url ? t.changeCover : t.addCover}
      </button>
    </div>
  );
}

export function StatusPanel({ product, workspaceId, slug, t, publicUrl }: { product: ProductDetailDto; workspaceId: string; slug: string; t: T; publicUrl: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const change = (status: "DRAFT" | "PUBLISHED" | "ARCHIVED") =>
    start(async () => {
      setError(null);
      const r = await setStatus(workspaceId, slug, product.id, status);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  const published = product.status === "PUBLISHED";

  return (
    <div className="grid gap-3">
      <p className="text-sm leading-7 text-muted">{published ? t.publishedHint : t.draftHint}</p>
      <Alert error={error} />
      <div className="flex flex-wrap gap-2">
        {published ? (
          <>
            <a href={publicUrl} target="_blank" rel="noreferrer" className="rounded-full bg-ink px-5 py-2.5 font-heading text-sm text-paper">{t.view}</a>
            <button type="button" disabled={busy} onClick={() => change("DRAFT")} className="rounded-full border border-ink/20 px-4 py-2.5 font-heading text-sm hover:border-ink/50 disabled:opacity-60">{t.unpublish}</button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => change("PUBLISHED")} className="rounded-full bg-ink px-5 py-2.5 font-heading text-sm text-paper disabled:opacity-60">{t.publish}</button>
        )}
        <button type="button" disabled={busy} onClick={() => change("ARCHIVED")} className="rounded-full px-4 py-2.5 font-heading text-sm text-muted hover:text-ink disabled:opacity-60">{t.archive}</button>
      </div>
    </div>
  );
}
