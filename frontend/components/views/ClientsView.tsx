"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { Empty, ErrorState, LoadingCard, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { initials, plural, tintFor } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { addDec, formatMoney, isZero } from "@/lib/money";

export function ClientsView() {
  const { business } = useApp();
  const toast = useToast();
  const clients = useAsync(() => api.listClients(business.id), [business.id]);
  const invoices = useAsync(() => api.listInvoices(business.id, { kind: "INVOICE", limit: 200 }), [business.id]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  // Still owed per client, kept in each invoice's own currency.
  const stats = useMemo(() => {
    const map = new Map<string, { count: number; owed: Record<string, string> }>();
    for (const i of invoices.data?.data ?? []) {
      if (!i.clientId) continue;
      const s = map.get(i.clientId) ?? { count: 0, owed: {} };
      s.count += 1;
      if (i.status !== "DRAFT" && !isZero(i.amountOutstanding)) s.owed[i.currency] = addDec(s.owed[i.currency] ?? "0", i.amountOutstanding);
      map.set(i.clientId, s);
    }
    return map;
  }, [invoices.data]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await api.createClient(business.id, { name: name.trim(), email: email.trim() || undefined });
      clients.setData((prev) => [...(prev ?? []), c].sort((a, b) => a.name.localeCompare(b.name)));
      toast(`${c.name} added`);
      setName("");
      setEmail("");
      setAdding(false);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p className="range">The people and companies you invoice.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding((v) => !v)} aria-expanded={adding} aria-controls="add-client">
          <Icon name="plus" className="icon icon-sm" />
          Add client
        </button>
      </div>

      {adding ? (
        <form id="add-client" className="card card-body flex flex-wrap items-end gap-3 pt-6" onSubmit={add}>
          <div className="field min-w-[200px] flex-1">
            <label className="label" htmlFor="client-name">
              Name
            </label>
            <input id="client-name" className="input" maxLength={120} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field min-w-[200px] flex-1">
            <label className="label" htmlFor="client-email">
              Email <span className="opt">(optional)</span>
            </label>
            <input id="client-email" className="input" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={busy || !name.trim()}>
            {busy ? "Adding…" : "Save client"}
          </button>
        </form>
      ) : null}

      <section className="card" aria-label="Client list">
        {clients.error && !clients.data ? (
          <ErrorState message={errorMessage(clients.error)} onRetry={clients.reload} />
        ) : clients.firstLoad ? (
          <div className="p-6">
            <LoadingCard rows={4} />
          </div>
        ) : (clients.data ?? []).length === 0 ? (
          <Empty icon="users" title="No clients yet">
            Add a client here, or straight from a new invoice.
          </Empty>
        ) : (
          <div className="table-scroll tall" style={{ marginTop: 0, borderTop: 0 }}>
            <table className="dt">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Invoices</th>
                  <th scope="col" className="r">
                    Still owed
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(clients.data ?? []).map((c) => {
                  const s = stats.get(c.id);
                  const owed = Object.entries(s?.owed ?? {});
                  return (
                    <tr key={c.id}>
                      <td className="c-who m-a">
                        <div className="who">
                          <span className={`av ${tintFor(c.name)}`} aria-hidden="true">
                            {initials(c.name)}
                          </span>
                          <div className="min-w-0">
                            <b>{c.name}</b>
                            <span className="sub">{c.email ?? "No email"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="num m-c">{plural(s?.count ?? 0, "invoice")}</td>
                      <td className="r num m-b">
                        {owed.length === 0 ? (
                          <span className="dash">Nothing owed</span>
                        ) : (
                          owed.map(([ccy, v]) => (
                            <span key={ccy} className="amt-main block">
                              {formatMoney(v, ccy)}
                            </span>
                          ))
                        )}
                      </td>
                      <td className="r m-d">
                        <Link className="btn btn-ghost btn-sm" href={`/invoices/new`}>
                          New invoice
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
