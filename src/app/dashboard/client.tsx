"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import LayoutComponent from "@/features/dashboard/components/layout/dashboard-layout";
import { authClientProvider } from "@/auth/client-provider";
import type { NavItemList } from "@/config/types";

export function DashboardLayoutClient({
  children,
  navItems,
  footerItems,
}: {
  children: React.ReactNode;
  navItems: NavItemList;
  footerItems: NavItemList;
}) {
  const pathname = usePathname();

  // Redirect on bfcache restore if session is gone
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && !document.cookie.includes("better-auth.session_token")) {
        window.location.replace("/auth/login");
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const handleLogout = async () => {
    try {
      await authClientProvider.signOut();
    } catch (e) {
      console.error(e);
    } finally {
      window.location.replace("/auth/login");
    }
  };

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
