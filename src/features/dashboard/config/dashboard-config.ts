import { LayoutDashboard, Users, Shield, Code, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NavItem, NavItemList } from "@/config/types";

export interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
}

export const dashboardConfig = {
  title: "Dashboard",
  version: "v1.0.0",
  defaultRoute: "/dashboard",
  rootLabel: "Dashboard",
  rootHref: "/dashboard",
  nav: [] satisfies NavItem[],
  footerNav: [] satisfies NavItem[],
  pages: {
    overview: {
      title: "Dashboard | Fix Pro AI",
      description: "Your repair quote dashboard overview.",
    },
  },
  quickActions: {
    title: "Quick Actions",
    description: "Get started with common tasks and explore the template features",
    items: [
      { href: "/auth/register", label: "Create Account", icon: Users },
      { href: "/admin", label: "Admin Panel", icon: Shield },
      {
        href: "https://fixpro.ai",
        label: "Help Center",
        icon: Mail,
        external: true,
      },
    ] satisfies QuickAction[],
  },
  techStack: {
    title: "Tech Stack",
    description: "Built with modern technologies for performance, security, and developer experience",
    items: [
      "Next.js 15",
      "Better Auth",
      "PostgreSQL",
      "Drizzle ORM",
      "Tailwind CSS",
      "Radix UI",
      "TypeScript",
      "React Hook Form",
      "Zod",
    ],
  },
} as const;

// Suppress unused import warning — NavItemList used by consumers of this module
export type { NavItem, NavItemList };
