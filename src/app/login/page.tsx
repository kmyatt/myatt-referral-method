import Link from "next/link";

import { LoginForm } from "@/client-forms";
import { AppLogo, Card } from "@/ui";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-4">
          <AppLogo />
          <h1 className="text-4xl font-semibold tracking-[-0.06em] text-slate-950">Welcome back.</h1>
          <p className="text-base leading-7 text-[var(--muted)]">Sign in to manage referral discounts, business performance, or your subscriber-facing referral dashboard.</p>
          <p className="text-sm text-[var(--muted)]">New here? <Link className="font-semibold text-slate-950" href="/signup">Create an account</Link>.</p>
        </Card>
        <Card>
          <LoginForm />
        </Card>
      </div>
    </main>
  );
}

