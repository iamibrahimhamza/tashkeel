import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthGuard } from "./common/auth";
import { ApiExceptionFilter } from "./common/errors";
import { IdempotencyInterceptor } from "./common/idempotency";
import { PrismaService } from "./common/prisma.service";
import { AuthController } from "./modules/auth/auth.controller";
import { BookingModule } from "./modules/booking/booking.module";
import { CrmController } from "./modules/crm/crm.controller";
import { HealthController } from "./modules/health.controller";
import { PayModule } from "./modules/pay/pay.module";
import { ProductsModule } from "./modules/products/products.module";
import { InlineScheduler } from "./modules/scheduler.service";
import { SitesController } from "./modules/sites/sites.controller";
import { StorageModule } from "./modules/storage/storage.module";
import { WaitlistController } from "./modules/waitlist/waitlist.controller";
import { WorkspacesController } from "./modules/workspaces/workspaces.controller";

@Module({
  imports: [
    // Global default: 100 requests/min per client. Sensitive routes tighten this with @Throttle.
    // Multi-instance deployments plug a Redis storage in here (@nest-lab/throttler-storage-redis).
    ThrottlerModule.forRoot({ throttlers: [{ name: "default", ttl: 60_000, limit: 100 }] }),
    StorageModule,
    PayModule,
    BookingModule,
    ProductsModule,
  ],
  controllers: [HealthController, AuthController, WorkspacesController, SitesController, WaitlistController, CrmController],
  providers: [
    PrismaService,
    InlineScheduler,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
