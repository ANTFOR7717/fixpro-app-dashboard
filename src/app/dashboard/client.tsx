"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import LayoutComponent from "@/features/dashboard/components/layout/dashboard-layout";
import { authClientProvider } from "@/auth/client-provider";
import { featureRegistry } from "@/lib/registry";

export function DashboardLayoutClient({
  children,
  role,
}: {
  children: React.ReactNode;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await authClientProvider.signOut();
      router.push("/auth/login");
    } catch (e) {
      console.error(e);
    }
  };

  const navItems = featureRegistry.getNavigation(role, "sidebar");
  const footerItems = featureRegistry.getNavigation(role, "footer");

  return (
    <LayoutComponent
      pathname={pathname}
      onLogout={handleLogout}
      navItems={navItems}
      footerItems={footerItems}
      title="Fix Pro AI"
      version="v1.0.0"
      rootLabel="Dashboard"
      rootHref="/dashboard"
    >
      {children}
    </LayoutComponent>
  );
}
