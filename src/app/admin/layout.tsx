import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AdminLayoutClient } from "./client";

export default async function AdminLayout({
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

  if (session.user.role !== "admin") {
    return notFound();
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
