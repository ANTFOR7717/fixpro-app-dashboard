import { featureRegistry } from "@/config/features-index";
import { notFound } from "next/navigation";

interface FeaturePageProps {
  params: Promise<{ feature: string }>;
}

export default async function DynamicFeaturePage({ params }: FeaturePageProps) {
  const { feature: featureId } = await params;

  // Look up the feature in our modular registry
  const feature = featureRegistry.getFeature(featureId);

  // Fallback to 404 if the feature doesn't exist or doesn't define a page
  if (!feature || !feature.page) {
    notFound();
  }

  // Render the feature's custom page content
  return (
    <div className="flex-1 w-full h-full p-4 md:p-6 overflow-auto">
      {feature.page}
    </div>
  );
}
