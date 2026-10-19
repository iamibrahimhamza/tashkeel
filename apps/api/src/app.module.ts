import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthGuard } from "./common/auth";
import { ApiExceptionFilter } from "./common/errors";
import { IdempotencyInterceptor } from "./common/idempotency";
import { PrismaService } from "./common/prisma.service";
import { AuthController } from "./modules/auth/auth.controller";
import { HealthController } from "./modules/health.controller";
import { SitesController } from "./modules/sites/sites.controller";
import { WorkspacesController } from "./modules/workspaces/workspaces.controller";

@Module({
  imports: [
    // Global default: 100 requests/min per client. Sensitive routes tighten this with @Throttle.
    // Multi-instance deployments plug a Redis storage in here (@nest-lab/throttler-storage-redis).
    ThrottlerModule.forRoot({ throttlers: [{ name: "default", ttl: 60_000, limit: 100 }] }),
  ],
  controllers: [HealthController, AuthController, WorkspacesController, SitesController],
  providers: [
    PrismaService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
