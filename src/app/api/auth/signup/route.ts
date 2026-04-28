import bcrypt from "bcryptjs";

import { createSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const body = signupSchema.parse(await request.json());
    const email = body.email.toLowerCase();

    const existingUser = await prisma.platformUser.findUnique({ where: { email } });
    if (existingUser) {
      return Response.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    const user = await prisma.platformUser.create({
      data: {
        email,
        firstName: body.firstName,
        lastName: body.lastName,
        passwordHash: await bcrypt.hash(body.password, 10),
      },
    });

    await createSession(user.id, {
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return Response.json({ ok: true, accountType: body.accountType });
  } catch (error) {
    return apiError(error);
  }
}
