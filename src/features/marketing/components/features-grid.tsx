import { Zap, ShieldCheck, CreditCard, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/design-systems/shadcn/components/card";

export function FeaturesGrid() {
  const features = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Quotes in 5 Minutes",
      description:
        "Upload your inspection report and receive a detailed, free repair quote before you even finish your coffee.",
      items: [
        "Instant Processing",
        "7 Days a Week",
        "No Contractor Calls",
        "Zero Closing Delays",
      ],
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: "Licensed Contractor Team",
      description:
        "Every contractor in our network is vetted, licensed, and insured for every skill and trade pattern.",
      items: [
        "Fully Licensed",
        "Insured & Bonded",
        "Trade-Pattern Verified",
        "Background Checked",
      ],
    },
    {
      icon: <CreditCard className="h-5 w-5" />,
      title: "Flexible Billing Options",
      description:
        "Pay by credit card, check, or even out of escrow. Flexibility isn't a bug — it's a feature.",
      items: [
        "Credit Card",
        "Check Payment",
        "Escrow Billing",
        "Deferred Payment",
      ],
    },
    {
      icon: <Search className="h-5 w-5" />,
      title: "Automated Cost Shopping",
      description:
        "Our platform sources competitive repair quotes from multiple contractors automatically.",
      items: [
        "Multi-Contractor Bids",
        "Best-Price Matching",
        "Material Cost Breakdown",
        "Labor Estimates",
      ],
    },
  ];

  return (
    <div className="grid md:grid-cols-2 gap-6 mb-12">
      {features.map((feature, index) => (
        <Card
          key={index}
          className="border-border/50 hover:border-border transition-colors"
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {feature.icon}
              </div>
              <div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {feature.items.map((item, itemIndex) => (
                <div key={itemIndex} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="text-sm text-muted-foreground">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
