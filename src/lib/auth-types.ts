import type {
  BusinessStatus,
  BusinessUserRole,
  CustomerStatus,
  GlobalRole,
} from "@prisma/client";

export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  globalRole: GlobalRole;
  isActive: boolean;
  businessMemberships: Array<{
    businessId: string;
    role: BusinessUserRole;
    business: {
      id: string;
      name: string;
      slug: string;
      status: BusinessStatus;
    };
  }>;
  customerProfiles: Array<{
    id: string;
    businessId: string;
    status: CustomerStatus;
    business: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
};

