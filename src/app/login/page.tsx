"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { authClient, authEnabled, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { lookupCompanyCode } from "@/lib/api/company-code";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { authEmailsEnabled } from "@/lib/auth/email-password";
import {
  AuthShell,
  authButtonClass,
  authErrorClass,
  authFieldClass,
  authSecondaryButtonClass,
} from "@/components/auth-shell";

function redirectTarget() {
  if (typeof window !== "undefined") {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (token && /^[a-f0-9]{64}$/.test(token)) return `/invite/${token}`;
  }
  return "/app";
}

export default function LoginPage() {
  const { user } = useCurrentUserState();
  const [step, setStep] = useState<"company" | "credentials">("company");
  const [companyCode, setCompanyCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [ownerLogin, setOwnerLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const findingCompany = step === "company" && !ownerLogin;

  async function nextCompany(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await lookupCompanyCode(companyCode);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setCompanyName(response.data.companyName);
      setStep("credentials");
    } catch {
      setError("Couldn't look up that company. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const target = redirectTarget();
      const result = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
        callbackURL: target,
      });
      if (result.error) setError(result.error.message ?? "Incorrect email or password.");
      else window.location.assign(target);
    } catch {
      setError("We couldn't sign you in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
     
      headerRight={
        <Link href="/signup" className="font-medium text-[#111110] underline-offset-4 hover:underline">
          Create an account
        </Link>
      }
    >
      {user ? (
        <div className="rounded-3xl border border-[#DBDFD7] bg-white p-8 shadow-[0_1px_2px_rgba(17,17,16,0.04)]">
          <CheckCircle2 className="text-[#4E7357]" size={32} />
          <h1 className="mt-5 font-serif text-3xl leading-tight">You&rsquo;re signed in.</h1>
          <p className="mt-3 text-[#111110]/60">Continue to your hospital workspace.</p>
          <Link href="/app" className={`${authButtonClass} mt-7`}>
            Open workspace <ArrowRight size={18} />
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#111110]/45">
            {findingCompany ? "" : ""}
          </p>
          <h1 className="mt-5 font-serif text-[40px] leading-[1.08] tracking-tight sm:text-5xl">
            {findingCompany ? "Where do you work?" : "Welcome back."}
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-[#111110]/60">
            {findingCompany
              ? "Enter your organisation's access code to continue."
              : companyName
                ? `Sign in to ${companyName} with your account.`
                : "Enter your email and password to continue."}
          </p>

          {findingCompany ? (
            <form onSubmit={nextCompany} className="mt-9 space-y-6">
              <label htmlFor="company-code" className="block text-sm font-medium">
                Company access code
                <input
                  id="company-code"
                  required
                  minLength={4}
                  maxLength={20}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="e.g. NORTH-TEAM"
                  className={`${authFieldClass} uppercase tracking-[0.08em]`}
                  value={companyCode}
                  onChange={(e) =>
                    setCompanyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))
                  }
                />
              </label>
              {error && (
                <p role="alert" className={authErrorClass}>
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy || !authEnabled} className={authButtonClass}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Building2 size={18} />}
                Continue <ArrowRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOwnerLogin(true);
                  setStep("credentials");
                  setError("");
                }}
                className="w-full text-sm font-medium text-[#111110]/70 underline-offset-4 hover:text-[#111110] hover:underline"
              >
                I&rsquo;m a company owner · Sign in without a code
              </button>
            </form>
          ) : (
            <form className="mt-9 space-y-5" onSubmit={submit}>
              {companyName && (
                <div className="flex items-center gap-3 rounded-xl border border-[#DBDFD7] bg-white p-3">
                  <Building2 size={19} className="text-[#4E7357]" />
                  <div>
                    <p className="text-xs text-[#111110]/50">Company</p>
                    <p className="text-sm font-medium">{companyName}</p>
                  </div>
                </div>
              )}
              <label htmlFor="email" className="block text-sm font-medium">
                Email address
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={authFieldClass}
                  placeholder="you@hospital.com"
                />
              </label>
              <label htmlFor="password" className="block text-sm font-medium">
                Password
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${authFieldClass} pr-12`}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((x) => !x)}
                    className="absolute inset-y-0 right-3 flex items-center px-2 text-[#111110]/45 hover:text-[#111110]"
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </label>
              <div className="flex justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep("company");
                    setOwnerLogin(false);
                    setError("");
                  }}
                  className="inline-flex items-center gap-2 text-sm text-[#111110]/55 hover:text-[#111110]"
                >
                  <ArrowLeft size={16} /> Back
                </button>
                {authEmailsEnabled && (
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-[#111110] underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              {error && (
                <p role="alert" className={authErrorClass}>
                  {error}
                </p>
              )}
              <button type="submit" disabled={!authEnabled || busy} className={authButtonClass}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <LockKeyhole size={18} />}
                Sign in <ArrowRight size={18} />
              </button>
              {GROK_PROVIDERS.length > 0 && (
                <div className="space-y-2 border-t border-[#E4E6DF] pt-5">
                  {GROK_PROVIDERS.map((p) => (
                    <button
                      key={p.providerId}
                      type="button"
                      onClick={() => {
                        void signIn(p.providerId, { callbackURL: redirectTarget() }).catch(() =>
                          setError("Provider sign-in failed."),
                        );
                      }}
                      className={authSecondaryButtonClass}
                    >
                      Continue with {p.label}
                    </button>
                  ))}
                </div>
              )}
            </form>
          )}

          {!authEnabled && (
            <p className="mt-5 text-sm text-[#8A6A1F]">
              Authentication must be enabled in this environment.
            </p>
          )}
        
        </>
      )}
    </AuthShell>
  );
}
