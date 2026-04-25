import type { FeatureMetadata } from "@/lib/registry";
import { EstimateView } from "./components/estimate-view";

export const estimateMetadata: FeatureMetadata = {
  id: "estimate",
  name: "Repair Estimates",
  page: <EstimateView />,
  widgets: [],
};
