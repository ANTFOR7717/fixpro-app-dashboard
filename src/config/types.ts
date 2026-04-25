import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// ReadonlyArray so as-const config arrays are directly assignable without spread copies
export type NavItemList = ReadonlyArray<NavItem>;
