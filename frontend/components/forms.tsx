"use client";

import { CoinGlyph, Icon } from "@/components/icons";
import { ceilDec, divDec, formatCrypto, formatMoney, isZero, mulDec, symbolFor } from "@/lib/money";
import { PAYMENT_PAIRS, type Currency, type PaymentPair, type RatesSnapshot } from "@/lib/types";

export function cleanAmount(s: string): string {
  return s.replace(/[,\s]/g, "");
}

// A price: digits with up to two decimal places, more than zero.
export function amountError(s: string): string | null {
  const v = cleanAmount(s);
  if (!v) return "Enter an amount.";
  if (!/^\d{1,15}(\.\d{1,2})?$/.test(v)) return "Use numbers only, with up to 2 decimal places.";
  if (isZero(v)) return "The amount must be more than zero.";
  return null;
}

export function PairChoice({ value, onChange, name }: { value: string; onChange: (p: PaymentPair) => void; name: string }) {
  return (
    <fieldset className="field">
      <legend className="label mb-1.5">Coin and network</legend>
      <div className="choices">
        {PAYMENT_PAIRS.map((p) => (
          <label key={p.id} className="choice">
            <input type="radio" name={name} value={p.id} checked={value === p.id} onChange={() => onChange(p)} />
            <CoinGlyph asset={p.cryptoAsset} className="coinglyph" />
            <span className="min-w-0">
              <span className="t">{p.cryptoAsset}</span>
              <span className="s">{p.networkName}</span>
            </span>
            <span className="check" aria-hidden="true">
              {value === p.id ? <Icon name="check" className="icon" style={{ width: 12, height: 12, strokeWidth: 3 }} /> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AmountInput({ id, currency, value, onChange, error, describedBy }: { id: string; currency: Currency; value: string; onChange: (v: string) => void; error?: string | null; describedBy?: string }) {
  return (
    <div className="input-affix">
      <span className="pre" aria-hidden="true">
        {symbolFor(currency)}
      </span>
      <input
        id={id}
        className="input num"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        style={{ paddingLeft: symbolFor(currency).length > 1 ? 52 : 32 }}
      />
    </div>
  );
}

// What the payer would send at today's rate. The real amount is fixed by
// the API's quote when the payer opens the link.
export function QuoteEstimate({ amount, currency, pair, rates, windowMinutes = 5, payer = "client" }: { amount: string; currency: Currency; pair: PaymentPair; rates: RatesSnapshot | null | undefined; windowMinutes?: number; payer?: "client" | "buyer" }) {
  const valid = !amountError(amount);
  const coinUsd = rates?.coins?.[pair.cryptoAsset];
  const perUnit = rates && coinUsd && rates.perUsd[currency] ? mulDec(coinUsd, rates.perUsd[currency]) : null; // price currency per coin
  const crypto = valid && perUnit && !isZero(perUnit) ? ceilDec(divDec(cleanAmount(amount), perUnit), 2) : null;
  return (
    <div className="card p-5">
      <p className="eyebrow">Your {payer} pays</p>
      <p className="mt-2 text-[28px] font-semibold tracking-tight num">{crypto ? formatCrypto(crypto, pair.cryptoAsset) : perUnit ? `0.00 ${pair.cryptoAsset}` : pair.cryptoAsset}</p>
      <p className="text-[13px] text-ink-2">
        on {pair.networkName}
        {perUnit ? (
          <>
            {" "}
            · 1 {pair.cryptoAsset} = <span className="num">{formatMoney(perUnit, currency, currency === "NGN" ? 0 : 2)}</span>
          </>
        ) : null}
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-[13px] text-ink-2">
        <li className="flex gap-2">
          <Icon name="clock" className="icon icon-sm mt-0.5 flex-none" />
          The exact amount is set when your {payer} opens the link, and held for {windowMinutes} minutes.
        </li>
        <li className="flex gap-2">
          <Icon name="refresh" className="icon icon-sm mt-0.5 flex-none" />
          {perUnit ? "This estimate uses today's Roqqu rate. Rates move, so the final amount can differ a little." : `The amount in coins is worked out from Roqqu's rate when your ${payer} opens the link.`}
        </li>
        <li className="flex gap-2">
          <Icon name="check" className="icon icon-sm mt-0.5 flex-none" />
          Part payments count. Your {payer} can pay the rest later from the same link.
        </li>
      </ul>
    </div>
  );
}
