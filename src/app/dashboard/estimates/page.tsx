import { EstimatesListView } from "@/features/estimate/components/estimates-list-view";

export default async function EstimatesPage() {
  return (
    <div className="flex-1 w-full h-full overflow-auto">
      <EstimatesListView />
    </div>
  );
}
