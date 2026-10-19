import { Injectable, Logger } from "@nestjs/common";
import { formatMoney, intlLocale } from "@tashkeel/core";
import type { EmailOutbox } from "@tashkeel/db";
import { env } from "../config/env";
import { PrismaService } from "./prisma.service";

type Rendered = { subject: string; text: string };
type Data = Record<string, unknown>;

/** Session time in the recipient's own timezone, Western digits. */
const when = (d: Data, locale: "ar" | "en") =>
  new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "full", timeStyle: "short", timeZone: String(d.timezone) }).format(new Date(String(d.startsAt)));

const money = (d: Data, locale: "ar" | "en") => formatMoney(BigInt(String(d.amountMinor ?? "0")), String(d.currency ?? "USD"), { locale });

/** Plain-text transactional templates. Arabic first; English for users who chose it. */
const TEMPLATES: Record<string, (d: Data, l: "ar" | "en") => Rendered> = {
  order_receipt: (d, l) =>
    l === "ar"
      ? { subject: "تم استلام دفعتك — تشكيل", text: `شكراً لك! استلمنا دفعتك بقيمة ${money(d, l)}.\n\n${(d.items as string[]).join("\n")}\n\nرقم الطلب: ${d.orderId}` }
      : { subject: "Payment received — Tashkeel", text: `Thank you! We received your payment of ${money(d, l)}.\n\n${(d.items as string[]).join("\n")}\n\nOrder: ${d.orderId}` },
  new_sale: (d, l) =>
    l === "ar"
      ? { subject: `عملية بيع جديدة: ${money(d, l)}`, text: `مبروك! تمت عملية بيع جديدة بقيمة ${money(d, l)}.\n${(d.items as string[]).join("\n")}` }
      : { subject: `New sale: ${money(d, l)}`, text: `Congratulations! New sale of ${money(d, l)}.\n${(d.items as string[]).join("\n")}` },
  booking_confirmed: (d, l) =>
    l === "ar"
      ? { subject: `تم تأكيد موعدك: ${d.title}`, text: `تم تأكيد جلستك مع ${d.expert}.\nالموعد: ${when(d, l)} (${d.timezone})` }
      : { subject: `Your session is confirmed: ${d.title}`, text: `Your session with ${d.expert} is confirmed.\nWhen: ${when(d, l)} (${d.timezone})` },
  new_booking: (d, l) =>
    l === "ar"
      ? { subject: `حجز جديد: ${d.title}`, text: `حجز ${d.client} جلسة "${d.title}".\nالموعد: ${when(d, l)} (${d.timezone})` }
      : { subject: `New booking: ${d.title}`, text: `${d.client} booked "${d.title}".\nWhen: ${when(d, l)} (${d.timezone})` },
  payout_paid: (d, l) =>
    l === "ar"
      ? { subject: "تم تحويل أرباحك", text: `حوّلنا ${money(d, l)} إلى حسابك.\nمرجع التحويل: ${d.providerRef}` }
      : { subject: "Your payout was sent", text: `We sent ${money(d, l)} to your account.\nTransfer reference: ${d.providerRef}` },
  payout_failed: (d, l) =>
    l === "ar"
      ? { subject: "تعذّر تحويل أرباحك", text: `لم نتمكن من تحويل ${money(d, l)}. أعدنا المبلغ إلى رصيدك المتاح.\nالسبب: ${d.reason ?? "—"}` }
      : { subject: "Your payout could not be sent", text: `We could not send ${money(d, l)}. The amount is back in your available balance.\nReason: ${d.reason ?? "—"}` },
};

export function renderEmail(row: Pick<EmailOutbox, "template" | "locale" | "data">): Rendered {
  const t = TEMPLATES[row.template];
  if (!t) throw new Error(`unknown email template ${row.template}`);
  return t(row.data as Data, row.locale === "en" ? "en" : "ar");
}

/**
 * Relays the transactional outbox. Rows are claimed with FOR UPDATE SKIP LOCKED so several
 * relays can run at once without double-sending; dedupeKey made the rows unique on write.
 */
@Injectable()
export class EmailRelay {
  private readonly log = new Logger("EmailRelay");
  private transport?: { sendMail(m: { from: string; to: string; subject: string; text: string }): Promise<unknown> };

  constructor(private readonly prisma: PrismaService) {}

  async relayBatch(limit = 25): Promise<number> {
    let sent = 0;
    for (let i = 0; i < limit; i++) {
      const done = await this.prisma.db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<EmailOutbox[]>`
          SELECT * FROM "EmailOutbox" WHERE "sentAt" IS NULL AND attempts < 10
          ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!row) return null;
        try {
          const mail = renderEmail(row);
          await this.send(row.to, mail);
          await tx.emailOutbox.update({ where: { id: row.id }, data: { sentAt: new Date(), attempts: { increment: 1 } } });
          return true;
        } catch (e) {
          await tx.emailOutbox.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, lastError: String(e).slice(0, 1000) } });
          return false;
        }
      });
      if (done === null) break;
      if (done) sent++;
    }
    return sent;
  }

  private async send(to: string, mail: Rendered) {
    const url = env().SMTP_URL;
    if (!url) {
      this.log.log(`[email:dev] to=${to} subject="${mail.subject}"`);
      return;
    }
    if (!this.transport) {
      const nodemailer = await import("nodemailer");
      this.transport = nodemailer.createTransport(url);
    }
    await this.transport.sendMail({ from: env().EMAIL_FROM, to, subject: mail.subject, text: mail.text });
  }
}
