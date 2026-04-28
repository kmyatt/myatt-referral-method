export function businessNav(activeHref: string) {
  return [
    { href: "/dashboard/business", label: "Overview", active: activeHref === "/dashboard/business" },
    { href: "/dashboard/business/plans", label: "Plans", active: activeHref === "/dashboard/business/plans" },
    { href: "/dashboard/business/referral-settings", label: "Referral settings", active: activeHref === "/dashboard/business/referral-settings" },
    { href: "/dashboard/business/customers", label: "Customers", active: activeHref === "/dashboard/business/customers" },
    { href: "/dashboard/business/referrals", label: "Referrals", active: activeHref === "/dashboard/business/referrals" },
  ];
}

export function customerNav(activeHref: string) {
  return [{ href: "/dashboard/customer", label: "My dashboard", active: activeHref === "/dashboard/customer" }];
}

export function adminNav(activeHref: string) {
  return [{ href: "/dashboard/admin", label: "Platform", active: activeHref === "/dashboard/admin" }];
}

