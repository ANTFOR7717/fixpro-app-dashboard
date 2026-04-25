import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/design-systems/shadcn/components/card";
import { Badge } from "@/design-systems/shadcn/components/badge";

export function TechStack() {
  const capabilities = [
    "5-Minute Quotes",
    "Licensed Contractors",
    "Escrow Billing",
    "Automated Pricing",
    "Inspection Reports",
    "Free Estimates",
    "Cost Breakdowns",
    "7-Day Availability",
    "Vetted Network",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Capabilities</CardTitle>
        <CardDescription>
          Everything you need to turn inspection reports into actionable repair
          quotes without the operational friction
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {capabilities.map((item, index) => (
            <Badge key={index} variant="outline" className="px-3 py-1">
              {item}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
