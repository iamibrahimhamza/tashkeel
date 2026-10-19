import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { z } from "zod";

/**
 * Validates request input at the boundary against a @tashkeel/contracts schema.
 * Throws ZodError → mapped to 422 VALIDATION_ERROR by ApiExceptionFilter.
 *
 *   create(@ValidBody(CreateWorkspaceInput) input: CreateWorkspaceInput)
 */
type Source = "body" | "query";

// The schema is wrapped in an object: Nest treats any decorator argument that has a
// `transform` method as a pipe, and Zod schemas have one.
const extract = createParamDecorator((data: { source: Source; schema: z.ZodTypeAny }, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return data.schema.parse(req[data.source] ?? {});
});

export const ValidBody = (schema: z.ZodTypeAny) => extract({ source: "body", schema });
export const ValidQuery = (schema: z.ZodTypeAny) => extract({ source: "query", schema });
