import type { WaitlistEntryDto } from "@tashkeel/contracts";
import { dateTime, EmptyState, PageHeader, Panel, Table, Td } from "@/components/dash";
import { api } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Everyone who asked to join the beta from the landing page, newest first. */
export default async function AdminWaitlist() {
  const { token } = await requireSession("/admin/waitlist");
  const locale = await getLocale();
  const ar = locale === "ar";
  const { data, pagination } = await api<{ data: WaitlistEntryDto[]; pagination: { totalItems: number } }>("/v1/admin/waitlist?pageSize=100", { token });

  return (
    <>
      <PageHeader title={ar ? "قائمة الانتظار" : "Waitlist"} lead={ar ? `${pagination.totalItems} طلب انضمام` : `${pagination.totalItems} requests`} />
      <Panel>
        {data.length === 0 ? (
          <EmptyState
            icon="clients"
            title={ar ? "لا طلبات بعد" : "No requests yet"}
            body={ar ? "يظهر هنا كل من يطلب الانضمام إلى النسخة التجريبية من الصفحة الرئيسية." : "Everyone who asks to join the beta from the landing page appears here."}
          />
        ) : (
          <Table head={ar ? ["التاريخ", "الاسم", "البريد", "التخصص", "الرابط"] : ["Date", "Name", "Email", "Specialty", "Link"]}>
            {data.map((w) => (
              <tr key={w.id}>
                <Td className="whitespace-nowrap text-muted">{dateTime(w.createdAt, locale)}</Td>
                <Td className="font-heading">{w.name}</Td>
                <Td>
                  <span dir="ltr">{w.email}</span>
                </Td>
                <Td className="text-muted">{w.specialty ?? "—"}</Td>
                <Td>
                  {w.link ? (
                    <a href={w.link} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="text-accent">
                      {w.link.replace(/^https?:\/\//, "")}
                    </a>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
