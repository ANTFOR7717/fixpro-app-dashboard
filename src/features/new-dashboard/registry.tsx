import { Globe, Lightbulb } from "lucide-react";
import type { FeatureMetadata } from "@/lib/registry";

/**
 * New Dashboard Registry
 * 
 * We assume the following components exist or will be created:
 * - GlobalUsersCard: The world map visualization
 * - InsightsCard: The data insights section
 */
// import { GlobalUsersCard } from "./components/map/global-users-card";
// import { InsightsCard } from "./components/layout/insights-card";

// Placeholder components for demonstration:
const GlobalUsersPlaceholder = () => <div className="h-[300px] flex items-center justify-center bg-muted rounded-lg border-2 border-dashed">Global Users Map Placeholder</div>;
const InsightsPlaceholder = () => <div className="h-[200px] flex items-center justify-center bg-muted rounded-lg border-2 border-dashed">Insights Section Placeholder</div>;

export const newDashboardMetadata: FeatureMetadata = {
  id: "new-dashboard",
  name: "New Dashboard Experience",
  navigation: [
    {
      href: "/dashboard/new-dashboard",
      label: "Analytics",
      icon: Globe,
      position: "sidebar",
    },
  ],
  page: (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">New Dashboard Experience</h1>
        <p className="text-muted-foreground">This is the fully modular "new-dashboard" page, rendered through the registry.</p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4 bg-card rounded-xl border p-6 shadow-sm">
           <GlobalUsersPlaceholder />
        </div>
        <div className="col-span-3 bg-card rounded-xl border p-6 shadow-sm font-medium">
           <InsightsPlaceholder />
        </div>
      </div>
    </div>
  ),
  widgets: [],
};
