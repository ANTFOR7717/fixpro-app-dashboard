import { LayoutDashboard, Upload } from "lucide-react";
import type { FeatureMetadata } from "@/lib/registry";

export const dashboardMetadata: FeatureMetadata = {
  id: "dashboard",
  name: "Dashboard",
  navigation: [
    {
      href: "/dashboard",
      label: "Overview",
      icon: LayoutDashboard,
      position: "sidebar",
    },
  ],
  quickActions: [
    { href: "/dashboard/estimate", label: "Get Repair Estimate", icon: Upload },
  ],
};
