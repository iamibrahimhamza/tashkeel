import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import type { ApiError, ErrorCode } from "@tashkeel/contracts";
import { IllegalTransitionError } from "@tashkeel/core";
import { isUniqueViolation } from "@tashkeel/db";
import type { Response } from "express";
import { ZodError } from "zod";

/** Domain errors carry the public code and both languages; nothing internal leaks. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly messageAr?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const Errors = {
  unauthenticated: () => new DomainError("UNAUTHENTICATED", 401, "Authentication required", "يجب تسجيل الدخول"),
  forbidden: () => new DomainError("FORBIDDEN", 403, "You do not have permission to do this", "ليست لديك صلاحية لهذا الإجراء"),
  notFound: (what: string) => new DomainError("NOT_FOUND", 404, `${what} not found`, "العنصر غير موجود"),
  conflict: (message: string, messageAr?: string) => new DomainError("CONFLICT", 409, message, messageAr),
  badCredentials: () => new DomainError("UNAUTHENTICATED", 401, "Email or password is incorrect", "البريد الإلكتروني أو كلمة المرور غير صحيحة"),
};

function body(code: ErrorCode, message: string, messageAr?: string, details?: unknown): ApiError {
  return { error: { code, message, ...(messageAr ? { messageAr } : {}), ...(details !== undefined ? { details } : {}) } };
}

const STATUS_CODE: Record<number, ErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "VALIDATION_ERROR",
  429: "RATE_LIMITED",
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger("ApiExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const [status, payload] = this.map(exception);
    if (status >= 500) this.log.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(status).json(payload);
  }

  private map(e: unknown): [number, ApiError] {
    if (e instanceof DomainError) return [e.status, body(e.code, e.message, e.messageAr, e.details)];
    if (e instanceof ZodError) {
      return [422, body("VALIDATION_ERROR", "Request validation failed", "البيانات المرسلة غير صالحة", e.flatten())];
    }
    if (e instanceof ThrottlerException) {
      return [429, body("RATE_LIMITED", "Too many requests, slow down", "طلبات كثيرة، حاول بعد قليل")];
    }
    if (e instanceof IllegalTransitionError) return [409, body("CONFLICT", e.message, "لا يمكن تنفيذ هذا الإجراء في الحالة الحالية")];
    if (isUniqueViolation(e)) return [409, body("CONFLICT", "Resource already exists", "العنصر موجود مسبقاً")];
    if (e instanceof HttpException) {
      const status = e.getStatus();
      return [status, body(STATUS_CODE[status] ?? (status >= 500 ? "INTERNAL" : "BAD_REQUEST"), status >= 500 ? "Internal server error" : e.message)];
    }
    return [HttpStatus.INTERNAL_SERVER_ERROR, body("INTERNAL", "Internal server error", "حدث خطأ غير متوقع")];
  }
}
