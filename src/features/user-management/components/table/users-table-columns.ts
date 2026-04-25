import { type UserWithDetails } from "@/features/user-management/types";

export const COLUMNS = [
  { label: "Name" },
  { label: "Verification" },
  { label: "Linked Accounts" },
  { label: "Role" },
  { label: "Status" },
  { label: "Last Sign In" },
  { label: "Created At" },
  { label: "Actions", className: "w-[80px]" },
] as const;
