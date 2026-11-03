import { Injectable, Logger } from "@nestjs/common";
import { buildIcs, formatMoney, intlLocale } from "@tashkeel/core";
import type { EmailOutbox } from "@tashkeel/db";
import { env } from "../config/env";
import { PrismaService } from "./prisma.service";

type Attachment = { filename: string; content: string; contentType: string };
type Rendered = { subject: string; text: string; attachments?: Attachment[] };
type Data = Record<string, unknown>;

/** Session time in the recipient's own timezone, Western digits. */
const when = (d: Data, locale: "ar" | "en") =>
  new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "full", timeStyle: "short", timeZone: String(d.timezone) }).format(new Date(String(d.startsAt)));

const money = (d: Data, locale: "ar" | "en") => formatMoney(BigInt(String(d.amountMinor ?? "0")), String(d.currency ?? "USD"), { locale });

const link = (d: Data, locale: "ar" | "en") => (d.meetingUrl ? (locale === "ar" ? `\nرابط الجلسة: ${d.meetingUrl}` : `\nSession link: ${d.meetingUrl}`) : "");

/** Session emails carry a calendar invite. Rows queued before invites existed have no bookingId and go without. */
function withInvite(d: Data, r: Rendered, summary: string): Rendered {
  if (!d.bookingId || !d.endsAt) return r;
  const ics = buildIcs({ uid: String(d.bookingId), startsAt: new Date(String(d.startsAt)), endsAt: new Date(String(d.endsAt)), summary, url: d.meetingUrl ? String(d.meetingUrl) : null, description: r.text });
  return { ...r, attachments: [{ filename: "session.ics", content: ics, contentType: "text/calendar; charset=utf-8; method=PUBLISH" }] };
}

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
    withInvite(
      d,
      l === "ar"
        ? { subject: `تم تأكيد موعدك: ${d.title}`, text: `تم تأكيد جلستك مع ${d.expert}.\nالموعد: ${when(d, l)} (${d.timezone})${link(d, l)}` }
        : { subject: `Your session is confirmed: ${d.title}`, text: `Your session with ${d.expert} is confirmed.\nWhen: ${when(d, l)} (${d.timezone})${link(d, l)}` },
      `${d.title} — ${d.expert}`,
    ),
  new_booking: (d, l) =>
    withInvite(
      d,
      l === "ar"
        ? { subject: `حجز جديد: ${d.title}`, text: `حجز ${d.client} جلسة "${d.title}".\nالموعد: ${when(d, l)} (${d.timezone})${link(d, l)}` }
        : { subject: `New booking: ${d.title}`, text: `${d.client} booked "${d.title}".\nWhen: ${when(d, l)} (${d.timezone})${link(d, l)}` },
      `${d.title} — ${d.client}`,
    ),
  booking_reminder: (d, l) => {
    const soon = d.kind === "1h";
    return l === "ar"
      ? { subject: `${soon ? "جلستك بعد ساعة" : "تذكير بجلسة الغد"}: ${d.title}`, text: `${soon ? "تبدأ جلستك بعد ساعة تقريباً" : "نذكّرك بجلستك القادمة"} مع ${d.with}.\nالموعد: ${when(d, l)} (${d.timezone})${link(d, l)}` }
      : { subject: `${soon ? "Your session starts in an hour" : "Your session is tomorrow"}: ${d.title}`, text: `${soon ? "Your session starts in about an hour" : "A reminder of your upcoming session"} with ${d.with}.\nWhen: ${when(d, l)} (${d.timezone})${link(d, l)}` };
  },
  product_ready: (d, l) => {
    const until = new Intl.DateTimeFormat(intlLocale(l), { dateStyle: "long" }).format(new Date(String(d.expiresAt)));
    return l === "ar"
      ? { subject: `منتجك جاهز للتنزيل: ${d.title}`, text: `شكراً لشرائك "${d.title}" من ${d.expert}.\n\nرابط التنزيل الخاص بك:\n${d.link}\n\nيعمل الرابط حتى ${until}، ويتيح ${d.maxDownloads} مرات تنزيل. لا تشاركه مع أحد.\nإن انتهت صلاحيته يمكنك طلب رابط جديد من الصفحة نفسها ببريدك الإلكتروني.` }
      : { subject: `Your download is ready: ${d.title}`, text: `Thank you for buying "${d.title}" from ${d.expert}.\n\nYour personal download link:\n${d.link}\n\nIt works until ${until} for ${d.maxDownloads} downloads. Please don't share it.\nIf it expires, you can request a new one from the same page with your email.` };
  },
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
  private transport?: { sendMail(m: { from: string; to: string; subject: string; text: string; attachments?: Attachment[] }): Promise<unknown> };

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
    await this.transport.sendMail({ from: env().EMAIL_FROM ?? `Tashkeel <no-reply@${env().NEXT_PUBLIC_ROOT_DOMAIN}>`, to, subject: mail.subject, text: mail.text, attachments: mail.attachments });
  }
}
