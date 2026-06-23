import type { IconName } from "lucide-react/dynamic";

export interface NavItem {
  href: string;
  label: string;
  // String icon name (kebab-case), resolved at render time via
  // lucide-react's `DynamicIcon`. Keeping this a string keeps nav items
  // serializable across the server→client component boundary.
  icon: IconName;
}

// ReadonlyArray so as-const config arrays are directly assignable without spread copies
export type NavItemList = ReadonlyArray<NavItem>;
