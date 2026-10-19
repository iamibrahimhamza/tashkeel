import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IDEMPOTENCY_HEADER, IdempotencyKeyHeader } from "@tashkeel/contracts";
import { hashRequest, IDEMPOTENCY_TTL_MS } from "@tashkeel/core";
import { isUniqueViolation, type Prisma } from "@tashkeel/db";
import type { Response } from "express";
import { from, lastValueFrom, Observable } from "rxjs";
import type { AuthedRequest } from "./auth";
import { DomainError } from "./errors";
import { PrismaService } from "./prisma.service";

const IDEMPOTENT = "tashkeel:idempotent";

/** Marks a state-changing route as requiring an `Idempotency-Key` header. */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

/**
 * Honours Idempotency-Key per the API contract:
 *  - the key is claimed with a single INSERT; the unique (scope, key) constraint picks the winner;
 *  - same key + different payload → 422 IDEMPOTENCY_KEY_REUSED;
 *  - same key while the first request is still running → 409 IDEMPOTENCY_IN_FLIGHT;
 *  - same key after completion → the stored response is replayed verbatim;
 *  - 5xx outcomes release the key so the client may retry; 4xx outcomes are stored and replayed.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.reflector.getAllAndOverride<boolean>(IDEMPOTENT, [ctx.getHandler(), ctx.getClass()])) return next.handle();
    return from(this.run(ctx, next));
  }

  private async run(ctx: ExecutionContext, next: CallHandler): Promise<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const res = http.getResponse<Response>();

    const parsedKey = IdempotencyKeyHeader.safeParse(req.headers[IDEMPOTENCY_HEADER]);
    if (!parsedKey.success) {
      throw new DomainError("BAD_REQUEST", 400, "Idempotency-Key header (8–255 chars) is required", "ترويسة Idempotency-Key مطلوبة");
    }
    const key = parsedKey.data;
    const route = `${req.method} ${req.route?.path ?? req.path}`;
    const scope = `${req.user?.id ?? `ip:${req.ip}`}:${route}`;
    const requestHash = hashRequest(req.method, req.path, req.body);
    const db = this.prisma.db;

    try {
      await db.idempotencyKey.create({
        data: { scope, key, requestHash, expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS) },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const existing = await db.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
      if (!existing) throw new DomainError("IDEMPOTENCY_IN_FLIGHT", 409, "Request with this key is in progress, retry shortly");
      if (existing.requestHash !== requestHash) {
        throw new DomainError("IDEMPOTENCY_KEY_REUSED", 422, "Idempotency-Key was reused with a different request body", "تم استخدام مفتاح الطلب نفسه مع بيانات مختلفة");
      }
      if (existing.state === "IN_PROGRESS") {
        throw new DomainError("IDEMPOTENCY_IN_FLIGHT", 409, "A request with this key is still in progress", "الطلب نفسه قيد المعالجة");
      }
      res.status(existing.responseCode ?? 200);
      res.setHeader("Idempotent-Replayed", "true");
      return existing.responseBody;
    }

    try {
      const result = await lastValueFrom(next.handle(), { defaultValue: undefined });
      await db.idempotencyKey.update({
        where: { scope_key: { scope, key } },
        data: { state: "SUCCEEDED", responseCode: res.statusCode, responseBody: (result ?? null) as Prisma.InputJsonValue },
      });
      return result;
    } catch (err) {
      const status = err instanceof DomainError ? err.status : err instanceof HttpException ? err.getStatus() : 500;
      if (status >= 500) {
        // Unknown outcome (or input validation, which never reached the handler): release the key
        // so a retry can run. Handlers must themselves be safe to re-run after a crash.
        await db.idempotencyKey.delete({ where: { scope_key: { scope, key } } }).catch(() => undefined);
      } else {
        const responseBody =
          err instanceof DomainError ? { error: { code: err.code, message: err.message, messageAr: err.messageAr } } : { error: { code: "BAD_REQUEST", message: String((err as Error).message) } };
        await db.idempotencyKey.update({ where: { scope_key: { scope, key } }, data: { state: "FAILED", responseCode: status, responseBody } });
      }
      throw err;
    }
  }
}
