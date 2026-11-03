/**
 * Private object storage for product files and covers. Nothing is ever public: uploads and
 * downloads go through short-lived signed URLs, so the browser talks to the store directly and
 * file bytes never pass through the API in production.
 */
export interface ObjectStorage {
  /** A URL the browser can PUT the file to, with exactly this content type. */
  presignUpload(key: string, args: { mime: string; sizeBytes: number; expiresInSec: number }): Promise<string>;
  /** A URL that downloads the object as an attachment named `fileName`. */
  presignDownload(key: string, args: { fileName: string; expiresInSec: number; inline?: boolean }): Promise<string>;
  /** Size of a stored object, or null if nothing was uploaded under the key. */
  head(key: string): Promise<{ sizeBytes: number } | null>;
  delete(key: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

/** Keeps the original name for the download, but only characters that are safe in a storage key. */
export function safeKeyName(fileName: string): string {
  const cleaned = fileName.normalize("NFC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (cleaned || "file").slice(0, 120);
}

/** RFC 6266 attachment header that survives Arabic file names. */
export function contentDisposition(fileName: string, inline = false): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
