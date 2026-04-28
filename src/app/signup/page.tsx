import Link from "next/link";

import { SignupForm } from "@/client-forms";
import { AppLogo, Card } from "@/ui";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-4">
          <AppLogo />
          <h1 className="text-4xl font-semibold tracking-[-0.06em] text-slate-950">Create your Myatt Referral Method account.</h1>
          <p className="text-base leading-7 text-[var(--muted)]">Business owners can launch referral-aware subscription plans. Customers can also create accounts that connect to their subscriptions and referral dashboards.</p>
          <p className="text-sm text-[var(--muted)]">Already have an account? <Link className="font-semibold text-slate-950" href="/login">Sign in</Link>.</p>
        </Card>
        <Card>
          <SignupForm />
        </Card>
      </div>
    </main>
  );
}

