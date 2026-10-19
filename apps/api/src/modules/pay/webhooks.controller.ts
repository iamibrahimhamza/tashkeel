import { Controller, Headers, HttpCode, Inject, Param, Post, Req, type RawBodyRequest } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PayoutProviderEvent } from "@tashkeel/contracts";
import { MANUAL_RAILS } from "@tashkeel/core";
import type { Prisma } from "@tashkeel/db";
import type { Request } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Public } from "../../common/auth";
import { DomainError } from "../../common/errors";
import { QUEUES } from "../../common/queue";
import { env } from "../../config/env";
import { PAYMENT_GATEWAY, type PaymentGatewayAdapter } from "./gateway";
import { WebhookIntakeService } from "./webhook-intake.service";

const SIGNATURE_TOLERANCE_SEC = 300;

/**
 * Webhook endpoints verify the signature, then hand off to WebhookIntakeService, which stores
 * the event once and queues it. Processing happens off the request path.
 */
@Controller("v1/webhooks")
@Public()
@SkipThrottle()
export class WebhooksController {
  constructor(
    private readonly intake: WebhookIntakeService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayAdapter,
  ) {}

  @Post("stripe")
  @HttpCode(200)
  async stripe(@Req() req: RawBodyRequest<Request>, @Headers("stripe-signature") signature?: string) {
    if (!req.rawBody || !signature) throw new DomainError("BAD_REQUEST", 400, "Missing signature or body");
    const event = this.gateway.verifyWebhook(req.rawBody, signature);
    return this.intake.intake("stripe", event.id, event.type, event as unknown as Prisma.InputJsonValue, QUEUES.stripeEvents);
  }

  /**
   * Status callbacks from alternative payout rails. Signature header:
   *   x-tashkeel-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
   */
  @Post("payouts/:provider")
  @HttpCode(200)
  async payouts(@Param("provider") provider: string, @Req() req: RawBodyRequest<Request>, @Headers("x-tashkeel-signature") signature?: string) {
    const rail = provider.toUpperCase();
    if (!(MANUAL_RAILS as readonly string[]).includes(rail)) throw new DomainError("NOT_FOUND", 404, "Unknown payout provider");
    const secret = env().PAYOUT_WEBHOOK_SECRET;
    if (!secret) throw new DomainError("INTERNAL", 503, "Payout webhooks are not configured");
    if (!req.rawBody || !signature || !verifyHmac(req.rawBody, signature, secret)) throw new DomainError("BAD_REQUEST", 400, "Invalid webhook signature");

    const event = PayoutProviderEvent.parse(JSON.parse(req.rawBody.toString("utf8")));
    return this.intake.intake(`payout:${rail}`, event.eventId, `payout.${event.status.toLowerCase()}`, event, QUEUES.payoutEvents);
  }
}

export function signPayoutWebhook(rawBody: string, secret: string, at = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${at}.${rawBody}`).digest("hex");
  return `t=${at},v1=${mac}`;
}

function verifyHmac(raw: Buffer, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > SIGNATURE_TOLERANCE_SEC || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw.toString("utf8")}`).digest();
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
