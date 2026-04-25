import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardLayoutClient } from "./client";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await authServerProvider.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth/login");
  }

  return <DashboardLayoutClient role={session.user.role as "admin" | "user"}>{children}</DashboardLayoutClient>;
}
