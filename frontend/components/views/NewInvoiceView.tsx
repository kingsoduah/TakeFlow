"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AmountInput, amountError, cleanAmount, PairChoice, QuoteEstimate } from "@/components/forms";
import { Icon } from "@/components/icons";
import { CurrencySeg } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { useAsync } from "@/lib/hooks";
import { PAYMENT_PAIRS, type Currency, type PaymentPair } from "@/lib/types";

const NEW_CLIENT = "__new__";

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewInvoiceView() {
  const { business, currency: displayCurrency, refreshNav } = useApp();
  const router = useRouter();
  const clients = useAsync(() => api.listClients(business.id), [business.id]);
  const rates = useAsync(() => api.getRates(), []);

  const [clientId, setClientId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currency, setCurrency] = useState<Currency>(displayCurrency);
  const [amount, setAmount] = useState("");
  const [pair, setPair] = useState<PaymentPair>(PAYMENT_PAIRS[0]);
  const [due, setDue] = useState(() => inDays(14));
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<null | "send" | "draft">(null);
  const [error, setError] = useState<string | null>(null);

  const list = clients.data ?? [];
  const useNew = clientId === NEW_CLIENT || (clients.data !== undefined && list.length === 0);
  const amtErr = amountError(amount);
  const nameErr = useNew && !newName.trim() ? "Enter the client's name." : null;
  const clientErr = !useNew && !clientId ? "Choose a client." : null;
  const dueErr = !due ? "Pick a due date." : null;

  const submit = async (mode: "send" | "draft") => {
    setTouched(true);
    if (amtErr || nameErr || clientErr || dueErr) return;
    setBusy(mode);
    setError(null);
    try {
      let cid = clientId;
      if (useNew) {
        const c = await api.createClient(business.id, { name: newName.trim(), email: newEmail.trim() || undefined });
        cid = c.id;
        setClientId(c.id);
      }
      const inv = await api.createInvoice(business.id, {
        clientId: cid,
        description: description.trim() || undefined,
        amount: cleanAmount(amount),
        currency,
        cryptoAsset: pair.cryptoAsset,
        network: pair.network,
        dueDate: new Date(`${due}T23:59:00`).toISOString(),
        status: mode === "send" ? "PENDING" : "DRAFT",
      });
      if (mode === "send") {
        // The invoice exists now. If Roqqu can't make the address yet, the
        // API makes it on the client's first quote, so carry on either way.
        await api.assignAddress(business.id, inv.id).catch(() => undefined);
      }
      refreshNav();
      router.push(`/invoices/${inv.id}${mode === "send" ? "?created=1" : ""}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit("send");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/invoices" className="back">
            <Icon name="arrowLeft" className="icon icon-sm" />
            Invoices
          </Link>
          <h1 className="mt-1">New invoice</h1>
          <p className="range">Price it in any of five currencies. Your client pays in a stablecoin.</p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <form className="card card-body flex flex-col gap-5 pt-6" onSubmit={onSubmit} noValidate>
          {error ? (
            <div className="form-error" role="alert">
              <Icon name="alert" className="icon icon-sm" />
              {error}
            </div>
          ) : null}

          <div className="form-grid">
            <div className="field span-2">
              <label className="label" htmlFor="client">
                Client
              </label>
              {list.length > 0 ? (
                <select id="client" className="select" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-invalid={touched && !!clientErr}>
                  <option value="">Choose a client</option>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={NEW_CLIENT}>+ Add a new client</option>
                </select>
              ) : null}
              {touched && clientErr ? <span className="error-text">{clientErr}</span> : null}
            </div>
            {useNew ? (
              <>
                <div className="field">
                  <label className="label" htmlFor="new-client-name">
                    Client name
                  </label>
                  <input id="new-client-name" className="input" maxLength={120} value={newName} onChange={(e) => setNewName(e.target.value)} aria-invalid={touched && !!nameErr} />
                  {touched && nameErr ? <span className="error-text">{nameErr}</span> : null}
                </div>
                <div className="field">
                  <label className="label" htmlFor="new-client-email">
                    Client email <span className="opt">(optional)</span>
                  </label>
                  <input id="new-client-email" className="input" type="email" maxLength={254} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
              </>
            ) : null}

            <div className="field span-2">
              <span className="label" id="ccy-label">
                Price currency
              </span>
              <CurrencySeg name="invoice-currency" value={currency} onChange={setCurrency} label={null} legend="Price currency" full />
            </div>

            <div className="field">
              <label className="label" htmlFor="amount">
                Amount
              </label>
              <AmountInput id="amount" currency={currency} value={amount} onChange={setAmount} error={touched ? amtErr : null} describedBy="amount-err" />
              {touched && amtErr ? (
                <span id="amount-err" className="error-text">
                  {amtErr}
                </span>
              ) : null}
            </div>
            <div className="field">
              <label className="label" htmlFor="due">
                Due date
              </label>
              <input id="due" className="input" type="date" min={inDays(0)} value={due} onChange={(e) => setDue(e.target.value)} aria-invalid={touched && !!dueErr} />
              {touched && dueErr ? <span className="error-text">{dueErr}</span> : null}
            </div>

            <div className="span-2">
              <PairChoice name="invoice-pair" value={pair.id} onChange={setPair} />
            </div>

            <div className="field span-2">
              <label className="label" htmlFor="description">
                What it&apos;s for <span className="opt">(optional)</span>
              </label>
              <textarea id="description" className="textarea" maxLength={2000} placeholder="Website redesign, phase 2" value={description} onChange={(e) => setDescription(e.target.value)} />
              <span className="hint">Your client sees this on the payment page.</span>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => void submit("draft")}>
              {busy === "draft" ? "Saving…" : "Save as draft"}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!!busy}>
              {busy === "send" ? "Creating your link…" : "Create invoice and get link"}
            </button>
          </div>
        </form>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[96px]">
          <QuoteEstimate amount={amount} currency={currency} pair={pair} rates={rates.data} windowMinutes={business.quoteWindowMinutes ?? 5} />
        </aside>
      </div>
    </>
  );
}
