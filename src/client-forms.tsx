"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import {
  businessOnboardingSchema,
  checkoutCreateSchema,
  loginSchema,
  planSchema,
  referralSettingsSchema,
  signupSchema,
} from "@/lib/validators";
import { cn } from "@/lib/utils";

function resolveErrorMessage(error: unknown) {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return null;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: unknown;
  children: React.ReactNode;
}) {
  const message = resolveErrorMessage(error);

  return (
    <label className="block space-y-2 text-sm font-medium text-slate-800">
      <span>{label}</span>
      {children}
      {message ? <span className="text-xs text-amber-700">{message}</span> : null}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400",
        props.className,
      )}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-400",
        props.className,
      )}
    />
  );
}

function SubmitButton({
  children,
  pending,
}: {
  children?: React.ReactNode;
  pending: boolean;
}) {
  const label =
    typeof children === "string" && children.trim().length > 0
      ? children
      : children ?? "Continue";

  return (
    <button
      disabled={pending}
      type="submit"
      aria-label={typeof label === "string" ? label : "Submit"}
      className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Working..." : label}
    </button>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to sign in.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" {...form.register("email")} />
      </Field>
      <Field label="Password" error={form.formState.errors.password?.message}>
        <Input type="password" {...form.register("password")} />
      </Field>
      {message ? <p className="text-sm text-amber-700">{message}</p> : null}
      <SubmitButton pending={form.formState.isSubmitting}>Sign in</SubmitButton>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      accountType: "BUSINESS",
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to create account.");
        return;
      }

      router.push(values.accountType === "BUSINESS" ? "/dashboard/onboarding" : "/dashboard");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={form.formState.errors.firstName?.message}>
          <Input {...form.register("firstName")} />
        </Field>
        <Field label="Last name" error={form.formState.errors.lastName?.message}>
          <Input {...form.register("lastName")} />
        </Field>
      </div>
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" {...form.register("email")} />
      </Field>
      <Field label="Password" error={form.formState.errors.password?.message}>
        <Input type="password" {...form.register("password")} />
      </Field>
      <Field label="Account type">
        <select
          {...form.register("accountType")}
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-slate-950 outline-none"
        >
          <option value="BUSINESS">Business owner</option>
          <option value="CUSTOMER">Customer account</option>
        </select>
      </Field>
      {message ? <p className="text-sm text-amber-700">{message}</p> : null}
      <SubmitButton pending={form.formState.isSubmitting}>Create account</SubmitButton>
    </form>
  );
}

export function BusinessOnboardingForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(businessOnboardingSchema),
    defaultValues: {
      businessName: "",
      businessSlug: "",
      description: "",
      supportEmail: "",
      websiteUrl: "",
      defaultReferralPercent: 5,
      maxReferralDiscountPercent: undefined,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/onboarding/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to create business.");
        return;
      }

      router.push("/dashboard/business");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" error={form.formState.errors.businessName?.message}>
          <Input {...form.register("businessName")} />
        </Field>
        <Field label="Business slug" error={form.formState.errors.businessSlug?.message}>
          <Input {...form.register("businessSlug")} />
        </Field>
      </div>
      <Field label="Description" error={form.formState.errors.description?.message}>
        <Textarea {...form.register("description")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Support email" error={form.formState.errors.supportEmail?.message}>
          <Input type="email" {...form.register("supportEmail")} />
        </Field>
        <Field label="Website URL" error={form.formState.errors.websiteUrl?.message}>
          <Input type="url" placeholder="https://example.com" {...form.register("websiteUrl")} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default referral percent" error={form.formState.errors.defaultReferralPercent?.message}>
          <Input type="number" step="0.1" {...form.register("defaultReferralPercent", { valueAsNumber: true })} />
        </Field>
        <Field label="Optional max discount" error={form.formState.errors.maxReferralDiscountPercent?.message}>
          <Input type="number" step="0.1" {...form.register("maxReferralDiscountPercent", { valueAsNumber: true })} />
        </Field>
      </div>
      {message ? <p className="text-sm text-amber-700">{message}</p> : null}
      <SubmitButton pending={form.formState.isSubmitting}>Create business</SubmitButton>
    </form>
  );
}

export function PlanForm({
  endpoint,
  initialValues,
  submitLabel,
}: {
  endpoint: string;
  initialValues?: Partial<z.infer<typeof planSchema>>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      slug: initialValues?.slug ?? "",
      description: initialValues?.description ?? "",
      priceCents: initialValues?.priceCents ?? 25000,
      referralPercentOverride: initialValues?.referralPercentOverride,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(endpoint, {
        method: endpoint.includes("/plans/") ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to save plan.");
        return;
      }

      router.refresh();
      setMessage("Saved.");
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan name" error={form.formState.errors.name?.message}>
          <Input {...form.register("name")} />
        </Field>
        <Field label="Plan slug" error={form.formState.errors.slug?.message}>
          <Input {...form.register("slug")} />
        </Field>
      </div>
      <Field label="Description" error={form.formState.errors.description?.message}>
        <Textarea {...form.register("description")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monthly price (cents)" error={form.formState.errors.priceCents?.message}>
          <Input type="number" {...form.register("priceCents", { valueAsNumber: true })} />
        </Field>
        <Field label="Plan referral percent override" error={form.formState.errors.referralPercentOverride?.message}>
          <Input type="number" step="0.1" {...form.register("referralPercentOverride", { valueAsNumber: true })} />
        </Field>
      </div>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <SubmitButton pending={form.formState.isSubmitting}>{submitLabel}</SubmitButton>
    </form>
  );
}

export function ReferralSettingsForm({
  initialValues,
}: {
  initialValues: {
    referralProgramEnabled: boolean;
    defaultReferralPercent: number;
    maxReferralDiscountPercent?: number | null;
  };
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(referralSettingsSchema),
    defaultValues: {
      referralProgramEnabled: initialValues.referralProgramEnabled,
      defaultReferralPercent: initialValues.defaultReferralPercent,
      maxReferralDiscountPercent: initialValues.maxReferralDiscountPercent ?? undefined,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/business/referral-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to save settings.");
        return;
      }

      setMessage("Referral settings updated.");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-medium text-slate-900">
        <input type="checkbox" {...form.register("referralProgramEnabled")} className="h-4 w-4 rounded border-slate-300" />
        Enable referral discounts for this business
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default referral percent" error={form.formState.errors.defaultReferralPercent?.message}>
          <Input type="number" step="0.1" {...form.register("defaultReferralPercent", { valueAsNumber: true })} />
        </Field>
        <Field label="Optional max total discount" error={form.formState.errors.maxReferralDiscountPercent?.message}>
          <Input type="number" step="0.1" {...form.register("maxReferralDiscountPercent", { valueAsNumber: true })} />
        </Field>
      </div>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <SubmitButton pending={form.formState.isSubmitting}>Save settings</SubmitButton>
    </form>
  );
}

export function CheckoutForm({
  businessSlug,
  planOptions,
  referralCode,
}: {
  businessSlug: string;
  planOptions: Array<{ id: string; label: string }>;
  referralCode?: string | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(checkoutCreateSchema),
    defaultValues: {
      businessSlug,
      planId: planOptions[0]?.id ?? "",
      email: "",
      firstName: "",
      lastName: "",
      password: "",
      referralCode: referralCode ?? "",
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to start checkout.");
        return;
      }

      window.location.href = payload.url;
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Plan" error={form.formState.errors.planId?.message}>
        <select
          {...form.register("planId")}
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-slate-950 outline-none"
        >
          {planOptions.map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.label}</option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={form.formState.errors.firstName?.message}>
          <Input {...form.register("firstName")} />
        </Field>
        <Field label="Last name" error={form.formState.errors.lastName?.message}>
          <Input {...form.register("lastName")} />
        </Field>
      </div>
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" {...form.register("email")} />
      </Field>
      <Field label="Create password" error={form.formState.errors.password?.message}>
        <Input type="password" {...form.register("password")} />
      </Field>
      <Field label="Referral code" error={form.formState.errors.referralCode?.message}>
        <Input {...form.register("referralCode")} />
      </Field>
      {message ? <p className="text-sm text-amber-700">{message}</p> : null}
      <SubmitButton pending={form.formState.isSubmitting}>Continue to checkout</SubmitButton>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
