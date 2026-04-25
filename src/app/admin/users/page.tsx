import type { Metadata } from "next";
import { UsersTable } from "@/features/user-management/components/table/users-table";
import { adminConfig } from "@/features/user-management/config/admin-config";

export const metadata: Metadata = {
  title: adminConfig.pages.users.title,
  description: adminConfig.pages.users.description,
};

export default function UsersPage() {
  return <UsersTable />;
}
