import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { env } from "../../config/env";
import { contentDisposition, type ObjectStorage } from "./storage";

/** Any S3-compatible store: Cloudflare R2 in production, MinIO locally with Docker. */
@Injectable()
export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const cfg = env();
    if (!cfg.S3_ENDPOINT || !cfg.S3_BUCKET || !cfg.S3_ACCESS_KEY_ID || !cfg.S3_SECRET_ACCESS_KEY) {
      throw new Error("STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
    }
    this.bucket = cfg.S3_BUCKET;
    this.client = new S3Client({
      endpoint: cfg.S3_ENDPOINT,
      region: cfg.S3_REGION,
      credentials: { accessKeyId: cfg.S3_ACCESS_KEY_ID, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY },
      forcePathStyle: true, // MinIO needs it; R2 accepts it
    });
  }

  presignUpload(key: string, args: { mime: string; sizeBytes: number; expiresInSec: number }): Promise<string> {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: args.mime, ContentLength: args.sizeBytes }), {
      expiresIn: args.expiresInSec,
    });
  }

  presignDownload(key: string, args: { fileName: string; expiresInSec: number; inline?: boolean }): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: contentDisposition(args.fileName, args.inline) }), {
      expiresIn: args.expiresInSec,
    });
  }

  async head(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: Number(res.ContentLength ?? 0) };
    } catch (e) {
      if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
