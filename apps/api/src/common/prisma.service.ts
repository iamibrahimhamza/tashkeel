import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { prisma, type PrismaClient } from "@tashkeel/db";

/** Exposes the shared Prisma client through Nest DI so it can be swapped in tests. */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: PrismaClient = prisma;

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}
