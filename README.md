# Myatt Referral Method

Myatt Referral Method is a production-minded SaaS MVP for referral-powered subscription growth.

Businesses sell subscriptions. Their customers receive unique referral codes. When a new subscriber joins through that code and remains active, the referrer earns a percentage discount on their own subscription. If the referred subscriber cancels, pauses, fails payment, or otherwise becomes inactive, the referrer’s discount is recalculated and reduced automatically.

This repository now contains a real multi-tenant foundation instead of the earlier prototype.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS 4
- PostgreSQL
- Prisma ORM
- Stripe Billing integration layer
- Cookie-session authentication with Prisma-backed sessions
- Zod validation
- React Hook Form

## Product Roles

- `PLATFORM_ADMIN`
- `BUSINESS_OWNER`
- `BUSINESS_STAFF`
- `CUSTOMER`

## Core Domain Objects

- `PlatformUser`
- `AuthSession`
- `Business`
- `BusinessUser`
- `SubscriptionPlan`
- `Customer`
- `Subscription`
- `Referral`
- `ReferralDiscountRule`
- `BillingEvent`
- `PlatformFeeRecord`
- `AuditLog`
- `WebhookEvent`

## Referral Rules Implemented

- Every customer gets a unique referral code.
- Referred customers can only be referred once.
- Self-referrals are blocked.
- Discounts only count active referred subscriptions.
- Inactive statuses remove referral credit automatically.
- Discounts are percentage based, not fixed dollar credits.
- The effective price is recalculated whenever subscription status changes.
- Referral percentages can come from a business default, a business rule record, or a plan-level override.
- Historical calculations are captured in `BillingEvent` records.
- The schema supports an optional future max discount cap per business or rule.

## Key Application Areas

- Landing page: `/`
- Pricing / architecture page: `/pricing`
- Auth: `/login`, `/signup`
- Business onboarding: `/dashboard/onboarding`
- Business dashboard: `/dashboard/business`
- Plan management: `/dashboard/business/plans`
- Referral settings: `/dashboard/business/referral-settings`
- Customers: `/dashboard/business/customers`
- Referral analytics: `/dashboard/business/referrals`
- Customer dashboard: `/dashboard/customer`
- Admin dashboard: `/dashboard/admin`
- Public business page: `/business/[slug]`
- Public subscribe page: `/subscribe/[businessSlug]`
- Referral capture route: `/r/[referralCode]`

## API Surface

Public / checkout:

- `POST /api/checkout/create`
- `POST /api/stripe/webhook`

Customer:

- `GET /api/customer/me`
- `GET /api/customer/referrals`
- `GET /api/customer/subscription`

Business:

- `GET /api/business/dashboard`
- `GET /api/business/customers`
- `GET /api/business/referrals`
- `POST /api/business/plans`
- `PATCH /api/business/plans/[id]`
- `PATCH /api/business/referral-settings`
- `GET /api/business/analytics`

Admin:

- `GET /api/admin/businesses`
- `GET /api/admin/analytics`
- `GET /api/admin/webhook-events`

Auxiliary auth / onboarding:

- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/logout`
- `POST /api/onboarding/business`

## File Map

```text
src/
  app/
    page.tsx
    pricing/page.tsx
    login/page.tsx
    signup/page.tsx
    dashboard/
    business/[slug]/page.tsx
    subscribe/[businessSlug]/page.tsx
    r/[referralCode]/route.ts
    api/
  client-forms.tsx
  dashboard-nav.ts
  ui.tsx
  lib/
    auth.ts
    prisma.ts
    stripe.ts
    env.ts
    permissions.ts
    request-context.ts
    money.ts
    validators.ts
    referral-service.ts
    billing-service.ts
    stripe-service.ts
    analytics-service.ts
    audit-log-service.ts
    dashboard-data.ts
prisma/
  schema.prisma
  seed.ts
proxy.ts
```

## Local Setup

1. Install dependencies.

```bash
npm install
```

2. Copy the environment template.

```bash
Copy-Item .env.example .env
```

3. Update `.env`.

Required values:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `SESSION_SECRET`

Optional for Stripe mode:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

4. Generate Prisma Client.

```bash
npm run db:generate
```

5. Create the database schema.

Recommended bootstrap for a fresh local database:

```bash
npm run db:push
```

If you want a local named migration on your own machine:

```bash
npm run db:migrate -- --name myatt_mvp_init
```

6. Seed demo data.

```bash
npm run db:seed
```

7. Start development.

```bash
npm run dev
```

## Seeded Demo Accounts

All seeded accounts use the password `Password123`.

- Platform admin: `admin@myatt.test`
- Business owner: `owner@fitstream.test`
- Business staff: `staff@fitstream.test`
- Second business owner: `owner@steadyhq.test`
- Subscriber accounts: `alice@fitstream.test`, `ben@fitstream.test`, `cara@fitstream.test`, `drew@fitstream.test`, `erin@fitstream.test`, `frank@steadyhq.test`, `grace@steadyhq.test`

## Stripe Setup Notes

The app supports a real Stripe path and a no-Stripe demo fallback.

To enable real Stripe flows:

1. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
2. Turn `stripeCheckoutEnabled` on for the business.
3. Populate `stripePriceId` on each `SubscriptionPlan`.
4. Point Stripe webhooks to `POST /api/stripe/webhook`.
5. Subscribe Stripe to these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.created`
   - `invoice.finalized`
   - `invoice.paid`
   - `invoice.payment_failed`

Stripe billing notes:

- Use Stripe test mode locally before enabling live billing.
- Myatt referral discounts are synced with dedicated coupons only. The app creates or reuses coupons named like `MYATT_REFERRAL_5_PERCENT` and `MYATT_REFERRAL_10_PERCENT`.
- Those coupons use `duration=forever` because the referral discount is managed by the app and is explicitly replaced or removed whenever the customer’s active referral count changes.
- Coupon metadata includes `source=myatt_referral_method`, `businessId`, and `subscriptionId`.
- Before applying a new referral coupon, the sync service removes only existing Myatt referral discounts from the Stripe subscription and preserves unrelated manual or business discounts.
- Referral discount timing is best-effort and depends on webhook delivery before Stripe finalizes the next invoice. The app listens for `invoice.created` and `invoice.finalized` to improve this timing, but late webhook delivery can still miss the current cycle.

Without Stripe configuration, checkout falls back to a mock flow that still creates users, customers, subscriptions, referral relationships, and recalculated discounts so the dashboards remain usable in local development.

## Verification Performed

Successful checks in this environment:

- `npm run db:generate`
- `npm run lint`
- `npx tsc --noEmit`

Production build note:

- `npm run build` compiles the application successfully, but this sandbox fails during Next.js' final TypeScript spawn step with `spawn EPERM`. The app code itself is already verified separately with `tsc --noEmit`.

## Deployment Notes

- Provision PostgreSQL first.
- Run `npm run db:generate` and your migration or `db:push` workflow in CI/CD.
- Set a strong `SESSION_SECRET`.
- Add Stripe keys and webhook secret in the host environment.
- Make sure the deployed app URL matches `NEXT_PUBLIC_APP_URL`.
- Consider swapping the current cookie-session layer for Auth.js if you want social auth or managed session adapters later.

## Known MVP Limitations

- One active subscription per customer is the intended operating model for v1.
- Checkout falls back to a mock path when Stripe is not configured.
- Currency is currently USD-first.
- Monthly plans are the only billing interval surfaced in the UI.
- The generated SQL baseline migration could not be emitted inside this sandbox because Prisma's diff command hit an environment-level `spawn EPERM`, so migration instructions are provided above instead.

## Roadmap

- Add full Auth.js integration and password reset flows.
- Add Stripe Connect onboarding UI.
- Add customer self-service pause/resume actions.
- Add richer charts and cohort analytics.
- Add plan-specific hosted checkout URLs.
- Add configurable referral reactivation rules.
- Add platform fee settlement workflows.
