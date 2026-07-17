import { Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/design-systems/shadcn/components/card";
import { Button } from "@/design-systems/shadcn/components/button";
import Link from "next/link";
import { featureRegistry } from "@/config/features-index";
import { RefreshButton } from "@/features/estimate/components/refresh-button";

export default function DashboardOverview() {
  const quickActions = featureRegistry.getQuickActions();
  const widgets = featureRegistry.getWidgets();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Quick Actions */}
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Quick Actions
            </CardTitle>
            <CardDescription>
              Get started with common tasks and explore the platform features
            </CardDescription>
          </div>
          <RefreshButton />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                className="h-11 justify-start rounded-lg px-3.5 shadow-none"
                asChild
              >
                <Link
                  href={action.href}
                  {...(action.external ? { target: "_blank" } : {})}
                >
                  <action.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{action.label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dynamic Feature Widgets Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {widgets.map((widget) => {
          // Map abstract sizes to 12-column grid spans
          const sizeMap = {
            sm: "md:col-span-3",
            md: "md:col-span-6",
            lg: "md:col-span-9",
            full: "md:col-span-12",
          };
          const span = sizeMap[widget.size || "full"];

          return (
            <Card key={widget.id} className={`${span} shadow-none`}>
              <CardHeader>
                <CardTitle>{widget.title}</CardTitle>
                {widget.description && (
                  <CardDescription>{widget.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>{widget.component}</CardContent>
            </Card>
          );
        })}
      </div>

    </div>
  );
}
