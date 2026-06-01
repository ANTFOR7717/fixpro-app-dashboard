import type { FeatureMetadata } from "@/lib/registry";

export const authMetadata: FeatureMetadata = {
  id: "auth",
  name: "Authentication",
  publicPaths: ["/auth/login", "/auth/register", "/api/auth"],
  navigation: [
    {
      href: "/auth/login",
      label: "Login",
      icon: "log-in",
      position: "navbar",
    },
    {
      href: "/auth/register",
      label: "Register",
      icon: "user-plus",
      position: "navbar",
    },
  ],
};
