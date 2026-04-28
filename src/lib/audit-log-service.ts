import { AuditActorType, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function createAuditLog(input: {
  businessId?: string | null;
  actorUserId?: string | null;
  actorCustomerId?: string | null;
  actorType?: AuditActorType;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({
    data: {
      businessId: input.businessId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorCustomerId: input.actorCustomerId ?? null,
      actorType: input.actorType ?? AuditActorType.SYSTEM,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    },
  });
}
