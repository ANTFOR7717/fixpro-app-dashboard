import type { FeatureMetadata } from "@/lib/registry";

export const userManagementMetadata: FeatureMetadata = {
  id: "user-management",
  name: "User Management",
  navigation: [
    {
      href: "/admin/users",
      label: "Users",
      icon: "users",
      adminOnly: true,
      position: "sidebar",
    },
  ],
  // Future: Add a "User Stats" widget here
  widgets: [],
};
