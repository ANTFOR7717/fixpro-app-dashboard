import { LogIn, UserPlus } from "lucide-react";
import type { FeatureMetadata } from "@/lib/registry";

export const authMetadata: FeatureMetadata = {
  id: "auth",
  name: "Authentication",
  publicPaths: ["/auth/login", "/auth/register", "/api/auth"],
  navigation: [
    {
      href: "/auth/login",
      label: "Login",
      icon: LogIn,
      position: "navbar",
    },
    {
      href: "/auth/register",
      label: "Register",
      icon: UserPlus,
      position: "navbar",
    },
  ],
};
