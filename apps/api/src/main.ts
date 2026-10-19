import "reflect-metadata";
import { Logger, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { env } from "./config/env";

/** HTTP hardening shared by the real server and the test harness. */
export function configureApp(app: NestExpressApplication): INestApplication {
  const cfg = env();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.enableCors({
    origin: cfg.CORS_ORIGINS ?? [cfg.WEB_URL],
    credentials: true,
    allowedHeaders: ["authorization", "content-type", "idempotency-key"],
    exposedHeaders: ["idempotent-replayed", "retry-after"],
  });
  app.useBodyParser("json", { limit: "1mb" });
  app.enableShutdownHooks();
  return app;
}

export async function createApp() {
  const cfg = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Raw body is kept for webhook signature verification.
    rawBody: true,
    logger: cfg.NODE_ENV === "test" && !process.env.DEBUG_API ? false : undefined,
  });
  return configureApp(app);
}

if (require.main === module) {
  createApp()
    .then(async (app) => {
      const port = env().PORT;
      await app.listen(port);
      new Logger("Tashkeel API").log(`listening on http://localhost:${port}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
