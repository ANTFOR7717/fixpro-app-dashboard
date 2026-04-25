import type { Metadata } from "next";
import { dashboardConfig } from "@/features/dashboard/config/dashboard-config";
import DashboardOverview from "@/features/dashboard/components/overview/dashboard-overview";

export const metadata: Metadata = {
  title: dashboardConfig.pages.overview.title,
  description: dashboardConfig.pages.overview.description,
};

export default function DashboardPage() {
  return <DashboardOverview />;
}
