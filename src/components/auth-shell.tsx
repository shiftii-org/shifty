import Link from "next/link";

/**
 * Split-screen shell shared by /login and /signup.
 *
 * Left: a deliberately blank image panel — drop a single image (photography of a
 * ward team, a building, brand art …) inside the slot marked below; the panel
 * already handles cropping, rounding and small screens.
 *
 * Right: the form column, vertically centred beside the header.
 */
export function AuthShell({

  headerRight,
  children,
}: {

  headerRight: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#F6F4EF] text-[#111110] lg:grid lg:grid-cols-[minmax(420px,1fr)_minmax(460px,1fr)]">
      {/* ── Image panel (blank by design) ─────────────────────────────────── */}
      <div className="relative hidden p-4 lg:block xl:p-6">
        <div className="relative h-full min-h-[calc(100vh-2rem)] overflow-hidden rounded-[28px] bg-[linear-gradient(155deg,#CCDBD6_0%,#DCE5DC_52%,#EFEDE4_100%)]">
          {/*
            IMAGE SLOT — the blank area reserved for artwork.
            Add, for example:

              <Image
                src="/auth/signup.jpg"
                alt=""
                fill
                priority
                sizes="50vw"
                className="object-cover"
              />

            Everything else in this panel is decorative and can stay or go.
          */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                "linear-gradient(to right,#11111022 1px,transparent 1px),linear-gradient(to bottom,#11111022 1px,transparent 1px)",
              backgroundSize: "88px 88px",
            }}
          />
          <div
            aria-hidden
            className="absolute -bottom-40 -left-32 h-[420px] w-[420px] rounded-full bg-white/40 blur-3xl"
          />
          <Link
            href="/"
            className="absolute left-8 top-8 font-serif text-[26px] leading-none tracking-tight"
          >
            Shifti
          </Link>
          <p className="absolute bottom-8 left-8 max-w-xs text-sm leading-6 text-[#111110]/55">
            A better way to run healthcare.
          </p>
        </div>
      </div>

      {/* ── Form column ───────────────────────────────────────────────────── */}
      <section className="flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-[560px] items-center justify-between px-6 py-7 sm:px-10">
          <Link href="/" className="font-serif text-[26px] leading-none tracking-tight lg:hidden">
            Shifti
          </Link>
          <span className="hidden text-sm text-[#111110]/50 lg:block"></span>
          <div className="text-sm">{headerRight}</div>
        </header>
        <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-6 pb-16 sm:px-10">
          {children}
        </div>
      </section>
    </main>
  );
}

export const authFieldClass =
  "mt-2 w-full rounded-xl border border-[#DBDFD7] bg-white px-4 py-3.5 text-[15px] text-[#111110] outline-none transition placeholder:text-[#111110]/35 focus:border-[#7C9A85] focus:ring-4 focus:ring-[#CCDBD6]/60 disabled:opacity-60";

export const authButtonClass =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-[#111110] px-5 py-4 text-[15px] font-medium text-[#F6F4EF] transition hover:bg-[#2A2A28] disabled:cursor-not-allowed disabled:opacity-50";

export const authSecondaryButtonClass =
  "flex w-full items-center justify-center gap-2 rounded-xl border border-[#DBDFD7] bg-transparent px-5 py-3.5 text-sm font-medium text-[#111110] transition hover:bg-white disabled:opacity-50";

export const authErrorClass =
  "rounded-xl border border-[#E4C2BC] bg-[#FBF1EF] p-4 text-sm leading-6 text-[#8A2F22]";
