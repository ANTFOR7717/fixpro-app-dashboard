import { ClipboardList } from "lucide-react";
import type { FeatureMetadata } from "@/lib/registry";
import { RecentEstimatesWidget } from "./components/recent-estimates-widget";

export const estimateMetadata: FeatureMetadata = {
  id: "estimate",
  name: "Repair Estimates",
  navigation: [
    {
      href: "/dashboard/estimates",
      label: "Estimates",
      icon: "file-text",
      position: "sidebar",
    },
  ],
  quickActions: [
    { href: "/dashboard/estimate", label: "Upload Inspection Report", icon: ClipboardList },
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
