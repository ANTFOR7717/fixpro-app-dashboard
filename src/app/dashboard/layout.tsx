import { authServerProvider } from "@/auth/server-provider";
import { headers as getHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { featureRegistry } from "@/config/features-index";
import { DashboardLayoutClient } from "./client";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const reqHeaders = await getHeaders();

  const session = await authServerProvider.getSession({
    headers: reqHeaders,
  });

  if (!session) {
    redirect("/auth/login");
  }

  const role = session.user.role as "admin" | "user";
  const navItems = featureRegistry.getNavigation(role, "sidebar");
  const footerItems = featureRegistry.getNavigation(role, "footer");

  return (
    <DashboardLayoutClient navItems={navItems} footerItems={footerItems}>
      {children}
    </DashboardLayoutClient>
  );
}
