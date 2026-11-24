"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { authClient, authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { emailDeliveryStatus } from "@/lib/api/auth-status";
import { authEmailsEnabled } from "@/lib/auth/email-password";
import {
  AuthShell,
  authButtonClass,
  authErrorClass,
  authFieldClass,
} from "@/components/auth-shell";

export default function SignUpPage() {
  const { user, isPending } = useCurrentUserState();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailReady, setEmailReady] = useState<boolean | null>(authEmailsEnabled ? null : true);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authEmailsEnabled) return;
    void emailDeliveryStatus()
      .then((s) => setEmailReady(s.configured))
      .catch(() => setEmailReady(false));
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timeout = setTimeout(() => setResendCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timeout);
  }, [resendCooldown]);

  async function verifyRegistrationCode(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the six-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.emailOtp.verifyEmail({
        email: email.trim().toLowerCase(),
        otp,
      });
      if (result.error) setError(result.error.message ?? "Invalid or expired code. Try again.");
      else {
        setVerified(true);
        setOtp("");
      }
    } catch {
      setError("We could not verify your code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (busy || resendCooldown > 0) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim().toLowerCase(),
        type: "email-verification",
      });
      if (result.error) setError(result.error.message ?? "Unable to resend the code.");
      else {
        setOtp("");
        setResendCooldown(60);
      }
    } catch {
      setError("Unable to resend the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function destination() {
    if (typeof window !== "undefined") {
      const token = new URLSearchParams(window.location.search).get("invite");
      if (token && /^[a-f0-9]{64}$/.test(token)) return `/invite/${token}`;
    }
    return "/onboarding";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!emailReady) return;
    if (password.length < 8 || password.length > 128) {
      setError("Password must be 8–128 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        callbackURL: destination(),
      });
      if (response.error) setError(response.error.message ?? "Unable to create your account.");
      else if (authEmailsEnabled) {
        setVerificationSent(true);
        setPassword("");
        setConfirmation("");
        setResendCooldown(60);
      } else {
        setPassword("");
        setConfirmation("");
        window.location.assign(destination());
      }
    } catch {
      setError("Unable to create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
     
      headerRight={
        <Link href="/login" className="font-medium text-[#111110] underline-offset-4 hover:underline">
          Already registered? Sign in
        </Link>
      }
    >
      {verified ? (
        <div className="rounded-3xl border border-[#DBDFD7] bg-white p-8">
          <CheckCircle2 className="text-[#4E7357]" size={32} />
          <h1 className="mt-5 font-serif text-3xl leading-tight">Email verified</h1>
          <p role="status" className="mt-3 text-[15px] leading-7 text-[#111110]/60">
            Your account is verified. Sign in with your email and password, then finish setting up
            your hospital.
          </p>
          <Link href="/login" className={`${authButtonClass} mt-7`}>
            Sign in <ArrowRight size={18} />
          </Link>
        </div>
      ) : verificationSent ? (
        <div className="rounded-3xl border border-[#DBDFD7] bg-white p-8">
          <MailCheck className="text-[#4E7357]" size={32} />
          <h1 className="mt-5 font-serif text-3xl leading-tight">Verify your email</h1>
          <p className="mt-3 text-[15px] leading-7 text-[#111110]/60">
            We sent a six-digit code to <strong className="text-[#111110]">{email}</strong>. It
            expires in 10 minutes.
          </p>
          <form onSubmit={verifyRegistrationCode} className="mt-6 space-y-4">
            <label htmlFor="verification-otp" className="block text-sm font-medium">
              Verification code
              <input
                id="verification-otp"
                autoFocus
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                minLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className={`${authFieldClass} text-center text-2xl font-semibold tracking-[0.35em]`}
              />
            </label>
            {error && (
              <p role="alert" className={authErrorClass}>
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || otp.length !== 6} className={authButtonClass}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              Verify email <ArrowRight size={18} />
            </button>
          </form>
          <button
            type="button"
            disabled={busy || resendCooldown > 0}
            onClick={() => void resendCode()}
            className="mt-5 w-full text-center text-sm font-medium text-[#111110]/70 underline-offset-4 hover:text-[#111110] hover:underline disabled:opacity-50"
          >
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend verification code"}
          </button>
          <p className="mt-3 text-center text-xs text-[#111110]/40">
            Check your spam folder if the code hasn&rsquo;t arrived.
          </p>
        </div>
      ) : !authEnabled ? (
        <p className="rounded-xl border border-[#E6DCC0] bg-[#FBF6E9] p-4 text-sm leading-6 text-[#7A5C16]">
          Authentication is disabled for this environment.
        </p>
      ) : user && !isPending ? (
        <div>
          <CheckCircle2 className="text-[#4E7357]" size={30} />
          <p className="mt-3 text-[15px] text-[#111110]/60">You&rsquo;re signed in already.</p>
          <Link href="/onboarding" className={`${authButtonClass} mt-5`}>
            Continue hospital setup <ArrowRight size={18} />
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#111110]/45">
            Step 1 of 2 · Account details
          </p>
          <h1 className="mt-5 font-serif text-[40px] leading-[1.08] tracking-tight sm:text-5xl">
            Create your account.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-[#111110]/60">
            Your own secure sign-in. You&rsquo;ll set up your hospital next.
          </p>
          <form onSubmit={submit} className="mt-9 space-y-5">
            <label className="block text-sm font-medium" htmlFor="full-name">
              Full name
              <input
                id="full-name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                placeholder="Your full name"
                className={authFieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium" htmlFor="signup-email">
              Email address
              <input
                id="signup-email"
                required
                type="email"
                autoComplete="email"
                placeholder="you@hospital.com"
                className={authFieldClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium" htmlFor="signup-password">
              Create password
              <div className="relative">
                <input
                  id="signup-password"
                  required
                  type={showPassword ? "text" : "password"}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className={`${authFieldClass} pr-12`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center px-2 text-[#111110]/45 hover:text-[#111110]"
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </label>
            <label className="block text-sm font-medium" htmlFor="signup-confirm">
              Confirm password
              <input
                id="signup-confirm"
                required
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className={authFieldClass}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            {emailReady === false && (
              <p role="alert" className="rounded-xl border border-[#E6DCC0] bg-[#FBF6E9] p-4 text-sm leading-6 text-[#7A5C16]">
                Registration is awaiting our email verification configuration. No account can be
                created from this form yet.
              </p>
            )}
            {error && (
              <p role="alert" className={authErrorClass}>
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || !emailReady} className={authButtonClass}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              Create account <ArrowRight size={18} />
            </button>
            <div className="flex items-center justify-center gap-2 text-xs text-[#111110]/45">
              <UsersRound size={15} /> One account, your own hospital workspace
            </div>
          </form>
        </>
      )}
    </AuthShell>
  );
}
