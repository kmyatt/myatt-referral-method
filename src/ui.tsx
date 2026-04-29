import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/client-forms";
import { cn } from "@/lib/utils";

export function AppLogo({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent)] font-mono text-sm font-semibold text-white shadow-lg shadow-emerald-950/20">
        MRM
      </div>
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.28em] text-[var(--accent)]">
          Myatt Referral Method
        </p>
        <p className="text-sm text-[var(--muted)]">Referral-powered subscription growth</p>
      </div>
    </div>
  );
}

export function PageSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-5">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">{title}</h2>
        {description ? <p className="max-w-3xl text-base leading-7 text-[var(--muted)]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className="text-3xl font-semibold tracking-[-0.05em] text-slate-950">{value}</p>
      {hint ? <p className="text-sm text-[var(--muted)]">{hint}</p> : null}
    </Card>
  );
}

export function Badge({
  tone = "default",
  children,
}: {
  tone?: "default" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return <span className={cn("badge", `badge-${tone}`)}>{children}</span>;
}

export function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full border border-[var(--line)] bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:border-slate-400"
    >
      {children}
    </Link>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[var(--line)] bg-white">
      <div className="grid grid-cols-1">
        <table className="min-w-full divide-y divide-[var(--line)] text-left text-sm">
          <thead className="bg-slate-50/80 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 font-medium">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 align-top text-slate-700">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DashboardShell({
  title,
  subtitle,
  nav,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  nav: Array<{ href: string; label: string; active?: boolean }>;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const resolvedActions = actions ?? <LogoutButton />;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <aside className="hidden w-72 shrink-0 rounded-[2rem] border border-[var(--line)] bg-[rgba(255,255,255,0.84)] p-6 shadow-xl shadow-slate-950/5 lg:flex lg:flex-col">
        <AppLogo />
        <nav className="mt-8 space-y-2">
          {nav.map((item) => (
            item.active ? (
              <span
                key={item.href}
                aria-current="page"
                className="block rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white"
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                {item.label}
              </Link>
            )
          ))}
        </nav>
        <div className="mt-6 border-t border-[var(--line)] pt-6">
          <LogoutButton className="w-full justify-center" />
        </div>
      </aside>
      <main className="min-w-0 flex-1 space-y-6">
        <div className="rounded-[2rem] border border-[var(--line)] bg-[rgba(255,255,255,0.88)] p-6 shadow-xl shadow-slate-950/5 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Dashboard</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">{title}</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted)]">{subtitle}</p>
            </div>
            <div className="shrink-0 lg:hidden">{resolvedActions}</div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

export function MiniBarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-6">
        {data.map((item) => (
          <div key={item.label} className="space-y-2">
            <div className="flex h-36 items-end rounded-3xl bg-slate-100 p-2">
              <div
                className="w-full rounded-2xl bg-gradient-to-t from-[var(--accent)] to-emerald-300"
                style={{ height: `${Math.max((item.value / max) * 100, 12)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              <span>{item.label}</span>
              <span>{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
