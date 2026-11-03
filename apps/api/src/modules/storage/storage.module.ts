import { Global, Module } from "@nestjs/common";
import { env } from "../../config/env";
import { LocalStorage, LocalStorageController } from "./local-storage";
import { S3Storage } from "./s3-storage";
import { OBJECT_STORAGE } from "./storage";

/** Picks the storage driver once at boot; production requires S3 (see config/env.ts). */
@Global()
@Module({
  controllers: [LocalStorageController],
  providers: [{ provide: OBJECT_STORAGE, useFactory: () => (env().STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage()) }],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
