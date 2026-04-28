import crypto from "node:crypto";

import { GlobalRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthenticatedUser } from "@/lib/auth-types";
import { SESSION_COOKIE_NAME, SESSION_DURATION_DAYS } from "@/lib/constants";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sessionExpiryDate() {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DURATION_DAYS);
  return expires;
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.authSession.findUnique({
    where: {
      tokenHash: hashToken(token),
    },
    include: {
      user: {
        include: {
          businessUsers: {
            where: { isActive: true },
            include: {
              business: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  status: true,
                },
              },
            },
          },
          customerProfiles: {
            include: {
              business: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    globalRole: session.user.globalRole,
    isActive: session.user.isActive,
    businessMemberships: session.user.businessUsers.map((membership) => ({
      businessId: membership.businessId,
      role: membership.role,
      business: membership.business,
    })),
    customerProfiles: session.user.customerProfiles.map((customer) => ({
      id: customer.id,
      businessId: customer.businessId,
      status: customer.status,
      business: customer.business,
    })),
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (user.globalRole !== GlobalRole.PLATFORM_ADMIN) {
    redirect("/dashboard");
  }

  return user;
}

export async function createSession(
  userId: string,
  metadata?: { ipAddress?: string; userAgent?: string },
) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = sessionExpiryDate();

  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NEXT_PUBLIC_APP_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.authSession.deleteMany({
      where: {
        tokenHash: hashToken(token),
      },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

