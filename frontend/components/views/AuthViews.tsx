"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Logo } from "@/components/brand";
import { Icon } from "@/components/icons";
import { api, ApiError, errorMessage, USE_MOCKS } from "@/lib/api";
import { session } from "@/lib/session";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Logo onNavy width={156} priority />
        <h2>
          Every payment. <b>Accounted for.</b>
        </h2>
        <ul className="auth-points">
          <li>
            <Icon name="file" />
            Bill clients in naira, dollars, pounds, euros or cedis. They pay in USDT or USDC.
          </li>
          <li>
            <Icon name="link" />
            Share checkout links on WhatsApp, Instagram or your own website.
          </li>
          <li>
            <Icon name="check" />
            Every payment is checked on-chain and matched to its invoice for you.
          </li>
        </ul>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-logo">
            <Logo width={140} priority />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function SignInView() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login({ email: email.trim(), password });
      session.setToken(res.accessToken);
      const businesses = await api.listBusinesses();
      router.replace(businesses.length ? safeNext(params.get("next")) : "/onboarding");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "That email and password don't match." : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <h1>Sign in</h1>
      <p className="lead">Welcome back. See what came in and what is still owed.</p>
      {USE_MOCKS ? (
        <p className="note mt-5">
          <Icon name="info" className="icon icon-sm" />
          <span>
            <b>Sample data is on.</b> Any email and password opens the sample business.
          </span>
        </p>
      ) : null}
      <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate={false}>
        {error ? (
          <div className="form-error" role="alert">
            <Icon name="alert" className="icon icon-sm" />
            {error}
          </div>
        ) : null}
        <div className="field">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-lg btn-block mt-2" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-[14px] text-ink-2">
        New to TakeFlow?{" "}
        <Link className="link" href="/sign-up">
          Create an account
        </Link>
      </p>
    </AuthFrame>
  );
}

export function SignUpView() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = password.length > 0 && password.length < 8;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.register({ fullName: fullName.trim(), email: email.trim(), password });
      session.setToken(res.accessToken);
      session.setBusinessId(null);
      router.replace("/onboarding");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <h1>Create your account</h1>
      <p className="lead">Start sending invoices your clients can pay in stablecoins.</p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
        {error ? (
          <div className="form-error" role="alert">
            <Icon name="alert" className="icon icon-sm" />
            {error}
          </div>
        ) : null}
        <div className="field">
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input id="name" className="input" autoComplete="name" required maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            aria-invalid={short}
            aria-describedby="pw-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span id="pw-hint" className={short ? "error-text" : "hint"}>
            At least 8 characters.
          </span>
        </div>
        <button type="submit" className="btn btn-primary btn-lg btn-block mt-2" disabled={busy}>
          {busy ? "Creating your account…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-[14px] text-ink-2">
        Already have an account?{" "}
        <Link className="link" href="/sign-in">
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}

export function OnboardingView() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.getToken()) router.replace("/sign-in");
  }, [router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const b = await api.createBusiness({
        businessName: name.trim(),
        businessEmail: email.trim() || undefined,
        businessType: type.trim() || undefined,
      });
      session.setBusinessId(b.id);
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        session.clear();
        router.replace("/sign-in");
        return;
      }
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <p className="eyebrow">Step 2 of 2</p>
      <h1 className="mt-1">Set up your business</h1>
      <p className="lead">This is the name your clients and buyers see when they pay.</p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
        {error ? (
          <div className="form-error" role="alert">
            <Icon name="alert" className="icon icon-sm" />
            {error}
          </div>
        ) : null}
        <div className="field">
          <label className="label" htmlFor="biz-name">
            Business name
          </label>
          <input id="biz-name" className="input" required maxLength={120} placeholder="Lumen Studio" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="biz-email">
            Billing email <span className="opt">(optional)</span>
          </label>
          <input id="biz-email" className="input" type="email" maxLength={254} placeholder="billing@yourbusiness.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="biz-email-hint" />
          <span id="biz-email-hint" className="hint">
            Used for a payment when the buyer leaves their own details empty.
          </span>
        </div>
        <div className="field">
          <label className="label" htmlFor="biz-type">
            What you do <span className="opt">(optional)</span>
          </label>
          <input id="biz-type" className="input" maxLength={60} placeholder="Software studio" value={type} onChange={(e) => setType(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-lg btn-block mt-2" disabled={busy || !name.trim()}>
          {busy ? "Setting up…" : "Go to my dashboard"}
        </button>
      </form>
    </AuthFrame>
  );
}
