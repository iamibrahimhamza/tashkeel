import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../common/auth";
import { PrismaService } from "../common/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    await this.prisma.db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
