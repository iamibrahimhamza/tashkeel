import Link from "next/link";
import { notFound } from "next/navigation";
import { dateTime, money, PageHeader, Panel, StatusBadge } from "@/components/dash";
import { ApiRequestError } from "@/lib/api";
import { workspaceContext } from "../../context";
import { dashboardData } from "../../data";
import { addNote, deleteNote } from "./actions";
import { NoteForm } from "./note-form";

export default async function Client({ params }: { params: Promise<{ workspaceId: string; contactId: string }> }) {
  const { workspaceId, contactId } = await params;
  const { token, workspace, t, locale, base } = await workspaceContext(workspaceId);
  const record = await dashboardData(token, workspace.id)
    .contact(contactId)
    .catch((e: unknown) => {
      if (e instanceof ApiRequestError && e.status === 404) notFound();
      throw e;
    });
  const { contact, bookings, orders, activity, notes } = record;
  const c = t.dash.client;
  const types = c.types as Record<string, string>;

  return (
    <>
      <Link href={`${base}/clients`} className="mb-4 inline-block font-heading text-sm text-muted hover:text-ink">{locale === "ar" ? "→" : "←"} {c.back}</Link>
      <PageHeader
        title={contact.name ?? contact.email}
        lead={`${contact.email} · ${c.since} ${dateTime(contact.firstSeenAt, locale)} · ${t.dash.table.lifetime}: ${money(contact.lifetimeValueMinor, "USD", locale)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="grid gap-6">
          <Panel title={c.sessions}>
            {bookings.length === 0 ? (
              <p className="px-6 py-5 text-sm text-muted">{c.noSessions}</p>
            ) : (
              <ul className="divide-y divide-line">
                {bookings.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm">
                    <span className="font-heading">{b.serviceTitle}</span>
                    <span className="flex items-center gap-3 text-muted">
                      {dateTime(b.startsAt, locale, true)}
                      <StatusBadge status={b.status} t={t} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={c.purchases}>
            {orders.length === 0 ? (
              <p className="px-6 py-5 text-sm text-muted">{c.noPurchases}</p>
            ) : (
              <ul className="divide-y divide-line">
                {orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm">
                    <span>{o.items.join("، ")}</span>
                    <span className="flex items-center gap-3 text-muted">
                      <span dir="ltr">{money(o.subtotalMinor, o.currency, locale)}</span>
                      <StatusBadge status={o.status} t={t} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={c.activity}>
            {activity.length === 0 ? (
              <p className="px-6 py-5 text-sm text-muted">{c.noActivity}</p>
            ) : (
              <ol className="divide-y divide-line">
                {activity.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-sm">
                    <span>{types[a.type] ?? a.type}</span>
                    <span className="text-muted">{dateTime(a.at, locale, true)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <Panel title={c.notes}>
          <div className="grid gap-5 px-6 py-5">
            <p className="text-xs leading-6 text-muted">{c.notesHint}</p>
            <NoteForm action={addNote.bind(null, workspace.id, contact.id)} labels={{ placeholder: c.notePlaceholder, submit: c.addNote }} />
            {notes.length === 0 ? (
              <p className="text-sm text-muted">{c.noNotes}</p>
            ) : (
              <ul className="grid gap-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-xl bg-sand px-4 py-3.5">
                    <p className="whitespace-pre-line text-sm leading-7">{n.body}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted">
                      <span>
                        {n.author} · {dateTime(n.createdAt, locale, true)}
                      </span>
                      <form action={deleteNote.bind(null, workspace.id, contact.id, n.id)}>
                        <button className="hover:text-ink">{c.delete}</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
