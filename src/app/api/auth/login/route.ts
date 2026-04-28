import bcrypt from "bcryptjs";

import { createSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());

    const user = await prisma.platformUser.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await prisma.platformUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await createSession(user.id, {
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
