"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import DashboardLayout from "@/features/dashboard/components/layout/dashboard-layout";
import { authClientProvider } from "@/auth/client-provider";
import { adminConfig } from "@/features/user-management/config/admin-config";

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
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

  return (
    <DashboardLayout
      pathname={pathname}
      onLogout={handleLogout}
      navItems={adminConfig.nav}
      footerItems={adminConfig.footerNav}
      title={adminConfig.title}
      version={adminConfig.version}
      rootLabel={adminConfig.rootLabel}
      rootHref={adminConfig.rootHref}
    >
      {children}
    </DashboardLayout>
  );
}
