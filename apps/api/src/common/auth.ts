import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { can, type Permission, type WorkspaceRole } from "@tashkeel/core";
import type { Request } from "express";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env";
import { Errors } from "./errors";
import { PrismaService } from "./prisma.service";

export interface AuthUser {
  id: string;
  email: string;
  platformRole: "USER" | "STAFF" | "SUPERADMIN";
}

export interface WorkspaceContext {
  id: string;
  role: WorkspaceRole;
}

export type AuthedRequest = Request & { user?: AuthUser; workspace?: WorkspaceContext };

const ISSUER = "tashkeel";
const AUDIENCE = "tashkeel-api";
export const ACCESS_TOKEN_TTL_SEC = 60 * 60;

const key = () => new TextEncoder().encode(env().AUTH_SECRET);

export async function signAccessToken(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email, prole: user.platformRole })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(key());
}

async function verifyAccessToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string") return null;
    const prole = payload.prole === "STAFF" || payload.prole === "SUPERADMIN" ? payload.prole : "USER";
    return { id: payload.sub, email: payload.email, platformRole: prole };
  } catch {
    return null;
  }
}

// ── Decorators ───────────────────────────────────────

const PUBLIC = "tashkeel:public";
const PERMISSION = "tashkeel:permission";
const STAFF_ONLY = "tashkeel:staff";

/** Route needs no authentication (a valid token is still attached when present). */
export const Public = () => SetMetadata(PUBLIC, true);
/** Route is scoped to `:workspaceId` and requires this permission for the caller's role. */
export const RequirePermission = (p: Permission) => SetMetadata(PERMISSION, p);
/** Platform staff only (payout operations, webhook replays). */
export const StaffOnly = () => SetMetadata(STAFF_ONLY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw Errors.unauthenticated();
  return user;
});

export const CurrentWorkspace = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const ws = ctx.switchToHttp().getRequest<AuthedRequest>().workspace;
  if (!ws) throw new Error("CurrentWorkspace used on a route without @RequirePermission");
  return ws;
});

// ── Guard ────────────────────────────────────────────

/**
 * Global guard, in order: authenticate (Bearer JWT) → staff check → workspace membership + permission.
 * Membership is read from the database on every request so role changes apply immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const targets = [ctx.getHandler(), ctx.getClass()];

    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const user = await verifyAccessToken(header.slice(7));
      if (user) req.user = user;
    }

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    if (!req.user) throw Errors.unauthenticated();

    if (this.reflector.getAllAndOverride<boolean>(STAFF_ONLY, targets)) {
      if (req.user.platformRole === "USER") throw Errors.forbidden();
    }

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION, targets);
    if (permission) {
      const workspaceId = typeof req.params.workspaceId === "string" ? req.params.workspaceId : undefined;
      if (!workspaceId) throw new Error("@RequirePermission route is missing :workspaceId");
      const m = await this.prisma.db.membership.findUnique({
        where: { userId_workspaceId: { userId: req.user.id, workspaceId } },
        select: { role: true },
      });
      // 404 rather than 403 so workspace ids cannot be probed.
      if (!m) throw Errors.notFound("Workspace");
      if (!can(m.role, permission)) throw Errors.forbidden();
      req.workspace = { id: workspaceId, role: m.role };
    }
    return true;
  }
}
