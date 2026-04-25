import { Settings } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/design-systems/shadcn/components/card";
import { Badge } from "@/design-systems/shadcn/components/badge";
import { Button } from "@/design-systems/shadcn/components/button";
import Link from "next/link";
import { featureRegistry } from "@/lib/registry";

export default function DashboardOverview() {
  const quickActions = featureRegistry.getQuickActions();
  const widgets = featureRegistry.getWidgets();

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>
            Get started with common tasks and explore the platform features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                className="h-auto p-4 flex-col gap-2"
                asChild
              >
                <Link
                  href={action.href}
                  {...(action.external ? { target: "_blank" } : {})}
                >
                  <action.icon className="h-5 w-5" />
                  <span>{action.label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dynamic Feature Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
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
            <Card key={widget.id} className={span}>
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
