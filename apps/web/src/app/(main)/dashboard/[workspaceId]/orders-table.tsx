import type { OrderDto } from "@tashkeel/contracts";
import type { Dictionary } from "@tashkeel/i18n";
import { dateTime, EmptyState, money, StatusBadge, Table, Td } from "@/components/dash";

export function OrdersTable({ orders, t, locale }: { orders: OrderDto[]; t: Dictionary; locale: "ar" | "en" }) {
  if (!orders.length) return <EmptyState icon="sales" title={t.dash.empty.sales.title} body={t.dash.empty.sales.body} />;
  const c = t.dash.table;
  return (
    <Table head={[c.date, c.item, c.client, c.amount, c.fees, c.net, c.status]}>
      {orders.map((o) => (
        <tr key={o.id}>
          <Td className="whitespace-nowrap text-muted">{dateTime(o.paidAt ?? o.createdAt, locale)}</Td>
          <Td>{o.items.map((i) => i.title).join("، ")}</Td>
          <Td>
            <span dir="ltr">{o.customer.email}</span>
          </Td>
          <Td className="whitespace-nowrap font-heading">{money(o.subtotalMinor, o.currency, locale)}</Td>
          <Td className="whitespace-nowrap text-muted">{money((BigInt(o.platformFeeMinor) + BigInt(o.processorFeeMinor)).toString(), o.currency, locale)}</Td>
          <Td className="whitespace-nowrap">{o.status === "PAID" || o.status.includes("REFUNDED") ? money(o.netMinor, o.currency, locale) : "—"}</Td>
          <Td>
            <StatusBadge status={o.status} t={t} />
          </Td>
        </tr>
      ))}
    </Table>
  );
}
