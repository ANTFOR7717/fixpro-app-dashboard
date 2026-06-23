import type { FeatureMetadata } from "@/lib/registry";

export const dashboardMetadata: FeatureMetadata = {
  id: "dashboard",
  name: "Dashboard",
  navigation: [
    {
      href: "/dashboard",
      label: "Overview",
      icon: "layout-dashboard",
      position: "sidebar",
    },
  ],
  // Quick actions are now defined by the feature that owns the route
  // (see features/estimate/registry.tsx).
  quickActions: [],
};
