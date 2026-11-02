import { Controller, Get, HttpCode, Injectable, Put, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Public } from "../../common/auth";
import { DomainError } from "../../common/errors";
import { env } from "../../config/env";
import { contentDisposition, type ObjectStorage } from "./storage";

type Signed = Record<string, string>;

const sign = (fields: Signed) =>
  createHmac("sha256", env().AUTH_SECRET)
    .update(Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n"))
    .digest("base64url");

const denied = () => new DomainError("FORBIDDEN", 403, "Link is invalid or expired", "الرابط غير صالح أو منتهي الصلاحية");

function root() {
  return resolve(process.cwd(), env().LOCAL_STORAGE_DIR);
}

/** Resolves a key inside the storage root, refusing anything that would escape it. */
function pathFor(key: string) {
  if (!key || key.split("/").some((s) => s === "" || s === "." || s === "..")) throw denied();
  const p = resolve(root(), key);
  if (!p.startsWith(root() + sep)) throw denied();
  return p;
}

/**
 * Development storage on local disk. URLs point back at this API and carry an HMAC over every
 * parameter, so they behave like S3 presigned URLs: scoped to one key, one operation, one expiry.
 */
@Injectable()
export class LocalStorage implements ObjectStorage {
  private url(fields: Signed) {
    const q = new URLSearchParams({ ...fields, sig: sign(fields) });
    return `${env().API_URL}/v1/storage/local?${q.toString()}`;
  }

  async presignUpload(key: string, args: { mime: string; sizeBytes: number; expiresInSec: number }) {
    return this.url({ op: "put", key, mime: args.mime, size: String(args.sizeBytes), exp: String(Math.floor(Date.now() / 1000) + args.expiresInSec) });
  }

  async presignDownload(key: string, args: { fileName: string; expiresInSec: number; inline?: boolean }) {
    return this.url({ op: "get", key, name: args.fileName, inline: args.inline ? "1" : "0", exp: String(Math.floor(Date.now() / 1000) + args.expiresInSec) });
  }

  async head(key: string) {
    try {
      return { sizeBytes: (await stat(pathFor(key))).size };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(pathFor(key), { force: true });
  }
}

function verify(q: Record<string, string | undefined>, op: "put" | "get"): Signed {
  const { sig, ...rest } = q;
  const fields = Object.fromEntries(Object.entries(rest).filter((e): e is [string, string] => typeof e[1] === "string"));
  if (fields.op !== op || !sig) throw denied();
  const expected = Buffer.from(sign(fields));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw denied();
  if (Number(fields.exp) * 1000 < Date.now()) throw denied();
  return fields;
}

/** Serves LocalStorage URLs. Answers 404 unless STORAGE_DRIVER=local (never in production). */
@Controller("v1/storage/local")
export class LocalStorageController {
  private enabled() {
    if (env().STORAGE_DRIVER !== "local") throw new DomainError("NOT_FOUND", 404, "Not found");
  }

  @Public()
  @HttpCode(200)
  @Put()
  async put(@Query() q: Record<string, string>, @Req() req: Request) {
    this.enabled();
    const f = verify(q, "put");
    if ((req.headers["content-type"] ?? "").split(";")[0] !== f.mime) throw denied();
    const limit = Number(f.size);
    const target = pathFor(f.key!);
    const temp = `${target}.part`;
    await mkdir(dirname(target), { recursive: true });
    // Bytes past the declared size are read and dropped rather than cutting the connection, so the
    // uploader receives a clear 422 instead of a reset socket.
    const out = createWriteStream(temp);
    let received = 0;
    let tooBig = false;
    await new Promise<void>((done, fail) => {
      req.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > limit) tooBig = true;
        if (tooBig) return;
        if (!out.write(chunk)) {
          req.pause();
          out.once("drain", () => req.resume());
        }
      });
      req.on("end", done);
      req.on("error", fail);
    });
    await new Promise<void>((done) => out.end(done));
    if (tooBig) {
      await rm(temp, { force: true });
      throw new DomainError("VALIDATION_ERROR", 422, "Upload exceeds the declared size", "حجم الملف أكبر من المعلن");
    }
    await rename(temp, target);
    return { ok: true };
  }

  @Public()
  @Get()
  async get(@Query() q: Record<string, string>, @Res() res: Response) {
    this.enabled();
    const f = verify(q, "get");
    const path = pathFor(f.key!);
    res.setHeader("Content-Disposition", contentDisposition(f.name ?? "file", f.inline === "1"));
    res.sendFile(path, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: { code: "NOT_FOUND", message: "File not found" } });
    });
  }
}
