"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { CopyButton, CurrencySeg, ErrorState, Skeleton, useToast } from "@/components/ui";
import { api, API_URL, errorMessage } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { appOrigin } from "@/lib/links";
import { CURRENCY_NAME } from "@/lib/money";
import type { CreatedApiKey } from "@/lib/types";

export function SettingsView() {
  const { currency, setCurrency } = useApp();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="range">Your view, how payments are priced, and keys for your website.</p>
        </div>
      </div>

      <section className="card card-body pt-6" aria-labelledby="ccy-title">
        <h2 id="ccy-title" className="text-[16px] font-bold">
          Your display currency
        </h2>
        <p className="mt-1 max-w-[640px] text-[13px] text-ink-2">
          Dashboard totals show in this currency. It changes only what you see. Invoices and checkout links keep their own currency, and your clients always pay what the invoice says.
        </p>
        <div className="mt-4 max-w-[520px]">
          <CurrencySeg name="settings-currency" value={currency} onChange={setCurrency} label={null} legend="Your display currency" full />
        </div>
        <p className="hint mt-2">
          Dashboard totals show in {currency} ({CURRENCY_NAME[currency]}).
        </p>
      </section>

      <PaymentSettings />
      <ApiKeys />
    </>
  );
}

function PaymentSettings() {
  const { business } = useApp();
  const toast = useToast();
  const [saved, setSaved] = useState({ minutes: business.quoteWindowMinutes ?? 5, bps: business.shortfallToleranceBps ?? 50 });
  const [minutes, setMinutes] = useState(saved.minutes);
  const [bps, setBps] = useState(saved.bps);
  const [busy, setBusy] = useState(false);
  const changed = minutes !== saved.minutes || bps !== saved.bps;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const b = await api.updateBusiness(business.id, { quoteWindowMinutes: minutes, shortfallToleranceBps: bps });
      setSaved({ minutes: b.quoteWindowMinutes ?? minutes, bps: b.shortfallToleranceBps ?? bps });
      toast("Payment settings saved");
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card card-body pt-6" aria-labelledby="pricing-title" onSubmit={save}>
      <h2 id="pricing-title" className="text-[16px] font-bold">
        How payments are priced
      </h2>
      <p className="mt-1 max-w-[640px] text-[13px] text-ink-2">Payers see a crypto amount held at one rate for a short time. A payment sent inside that time counts at that rate.</p>
      <div className="form-grid mt-4 max-w-[640px]">
        <div className="field">
          <label className="label" htmlFor="window">
            Hold the price for
          </label>
          <select id="window" className="select" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="tolerance">
            Count as paid when short by up to
          </label>
          <select id="tolerance" className="select" value={bps} onChange={(e) => setBps(Number(e.target.value))} aria-describedby="tolerance-hint">
            {[0, 10, 25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Nothing (exact amount only)" : `${(n / 100).toFixed(n % 100 === 0 ? 0 : n % 10 === 0 ? 1 : 2)}% of the price`}
              </option>
            ))}
          </select>
          <span id="tolerance-hint" className="hint">
            Covers rounding and small rate moves.
          </span>
        </div>
      </div>
      <div className="mt-4">
        <button type="submit" className="btn btn-secondary" disabled={!changed || busy}>
          {busy ? "Saving…" : "Save payment settings"}
        </button>
      </div>
    </form>
  );
}

function ApiKeys() {
  const { business } = useApp();
  const toast = useToast();
  const keys = useAsync(() => api.listApiKeys(business.id), [business.id]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<CreatedApiKey | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const k = await api.createApiKey(business.id, name.trim());
      setFresh(k);
      setName("");
      keys.setData((prev) => [{ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt }, ...(prev ?? [])]);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await api.revokeApiKey(business.id, id);
      keys.setData((prev) => (prev ?? []).map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
      if (fresh?.id === id) setFresh(null);
      toast("Key revoked. Calls that use it now fail.");
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setRevoking(null);
      setConfirming(null);
    }
  };

  const example = `# Create a checkout for an order
curl -X POST ${API_URL}/checkouts \\
  -H "X-Api-Key: ${fresh ? fresh.key : "tfk_your_key"}" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":"25000","currency":"NGN","cryptoAsset":"USDT","network":"trc20","orderId":"A-2302","returnUrl":"https://yourshop.com/thanks"}'

# Send the buyer to the payment page
${appOrigin() || "https://your-takeflow-site"}/pay/<paymentReference>

# Check whether the order is paid
curl ${API_URL}/checkouts/by-order/A-2302 -H "X-Api-Key: tfk_your_key"
curl ${API_URL}/checkouts/<id> -H "X-Api-Key: tfk_your_key"`;

  return (
    <section className="card card-body pt-6" aria-labelledby="keys-title">
      <h2 id="keys-title" className="text-[16px] font-bold">
        Website API keys
      </h2>
      <p className="mt-1 max-w-[680px] text-[13px] text-ink-2">
        Your shop&apos;s server uses a key to create a checkout for each order and to check whether it is paid. Keep keys on your server, never in a web page.
      </p>

      <form className="mt-4 flex max-w-[560px] flex-wrap items-end gap-3" onSubmit={create}>
        <div className="field min-w-[220px] flex-1">
          <label className="label" htmlFor="key-name">
            Key name
          </label>
          <input id="key-name" className="input" maxLength={60} placeholder="Shop website" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={busy || !name.trim()}>
          <Icon name="key" className="icon icon-sm" />
          {busy ? "Creating…" : "Create key"}
        </button>
      </form>

      {fresh ? (
        <div className="mt-4 rounded-[12px] border border-line-strong bg-sunk p-4" role="status">
          <p className="note warn">
            <Icon name="alert" className="icon icon-sm" />
            <span>
              <b>Copy this key now.</b> For your safety it is shown only once. If you lose it, revoke it and make a new one.
            </span>
          </p>
          <p className="label mt-3">{fresh.name}</p>
          <div className="copybox wrap mt-1.5 bg-white">
            <code>{fresh.key}</code>
            <CopyButton text={fresh.key} label="Copy the new API key" toastMessage="Key copied" />
          </div>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setFresh(null)}>
            I&apos;ve saved it
          </button>
        </div>
      ) : null}

      <div className="mt-5">
        {keys.error && !keys.data ? (
          <ErrorState message={errorMessage(keys.error)} onRetry={keys.reload} />
        ) : keys.firstLoad ? (
          <Skeleton h={120} />
        ) : (keys.data ?? []).length === 0 ? (
          <p className="text-[13px] text-slate-grey">No keys yet.</p>
        ) : (
          <div className="table-scroll tall rounded-[12px] border border-line" style={{ marginTop: 0 }}>
            <table className="dt">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Key</th>
                  <th scope="col">Created</th>
                  <th scope="col">Last used</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(keys.data ?? []).map((k) => (
                  <tr key={k.id}>
                    <td className="m-a">
                      <b className="font-semibold">{k.name}</b>
                    </td>
                    <td className="m-c m-nopad">
                      <span className="mono text-[12px]">{k.prefix}_…</span>
                    </td>
                    <td className="num m-e m-nopad">{formatDate(k.createdAt, { year: true })}</td>
                    <td className="num m-hide">{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : <span className="dash">Never</span>}</td>
                    <td className="m-b">{k.revokedAt ? <span className="badge b-revoked">Revoked</span> : <span className="badge b-active">Active</span>}</td>
                    <td className="r m-f">
                      {k.revokedAt ? null : confirming === k.id ? (
                        <span className="inline-flex flex-wrap items-center justify-end gap-2">
                          <span className="text-[13px] text-ink-2">Revoke this key?</span>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => revoke(k.id)} disabled={revoking === k.id}>
                            {revoking === k.id ? "Revoking…" : "Yes, revoke"}
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirming(k.id)} aria-label={`Revoke ${k.name}`}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[14px] font-bold">Use it from your website</h3>
          <CopyButton variant="small" text={example} label="Copy the code example" toastMessage="Example copied">
            Copy example
          </CopyButton>
        </div>
        <pre className="code mt-2">
          <code>{example}</code>
        </pre>
        <p className="hint mt-2">Only trust the status from these calls. The Back to shop redirect is for the buyer and is not proof of payment.</p>
      </div>
    </section>
  );
}
