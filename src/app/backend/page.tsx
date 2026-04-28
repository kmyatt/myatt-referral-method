import { redirect } from "next/navigation";

export default function LegacyBackendPage() {
  redirect("/dashboard/admin");
}

