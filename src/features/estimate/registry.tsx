import { FileText } from "lucide-react";
import type { FeatureMetadata } from "@/lib/registry";
import { RecentEstimatesWidget } from "./components/recent-estimates-widget";

export const estimateMetadata: FeatureMetadata = {
  id: "estimate",
  name: "Repair Estimates",
  navigation: [
    {
      href: "/dashboard/estimates",
      label: "Estimates",
      icon: FileText,
      position: "sidebar",
    },
  ],
  quickActions: [
    { href: "/dashboard/estimates", label: "View All Estimates", icon: FileText },
  ],
  widgets: [
    {
      id: "recent-estimates",
      title: "Recent Estimates",
      description: "Track the processing status of your uploaded inspection reports.",
      component: <RecentEstimatesWidget />,
      size: "lg",
    }
  ],
};
