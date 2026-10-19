import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { LoginInput, SignupInput } from "@tashkeel/contracts";
import { hashPassword, verifyPassword } from "@tashkeel/core";
import { ACCESS_TOKEN_TTL_SEC, CurrentUser, Public, signAccessToken, type AuthUser } from "../../common/auth";
import { Errors } from "../../common/errors";
import { PrismaService } from "../../common/prisma.service";
import { ValidBody } from "../../common/zod";

// Constant-time-ish defence against user enumeration: verify against a dummy hash when the user is unknown.
const DUMMY_HASH = hashPassword("dummy-password-for-timing");

@Controller("v1/auth")
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("signup")
  async signup(@ValidBody(SignupInput) input: SignupInput) {
    const existing = await this.prisma.db.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) throw Errors.conflict("An account with this email already exists", "يوجد حساب بهذا البريد الإلكتروني");
    const user = await this.prisma.db.user.create({
      data: { email: input.email, name: input.name, locale: input.locale, passwordHash: await hashPassword(input.password) },
    });
    return this.session({ id: user.id, email: user.email, platformRole: user.platformRole }, user.name);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post("login")
  async login(@ValidBody(LoginInput) input: LoginInput) {
    const user = await this.prisma.db.user.findUnique({ where: { email: input.email } });
    const ok = await verifyPassword(input.password, user?.passwordHash ?? (await DUMMY_HASH));
    if (!user || !user.passwordHash || !ok) throw Errors.badCredentials();
    return this.session({ id: user.id, email: user.email, platformRole: user.platformRole }, user.name);
  }

  @Get("me")
  async me(@CurrentUser() auth: AuthUser) {
    const user = await this.prisma.db.user.findUnique({
      where: { id: auth.id },
      include: { memberships: { include: { workspace: { select: { id: true, slug: true, name: true } } } } },
    });
    if (!user) throw Errors.unauthenticated();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      timezone: user.timezone,
      platformRole: user.platformRole,
      workspaces: user.memberships.map((m) => ({ ...m.workspace, role: m.role })),
    };
  }

  private async session(user: AuthUser, name: string | null) {
    return {
      accessToken: await signAccessToken(user),
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      user: { id: user.id, email: user.email, name, platformRole: user.platformRole },
    };
  }
}
