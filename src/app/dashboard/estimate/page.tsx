import { headers } from "next/headers";
import { authServerProvider } from "@/auth/server-provider";
import { EstimateView } from "@/features/estimate/components/estimate-view";
import { listContactsForUser } from "@/features/contacts/api/get-contacts";

export default async function EstimatePage() {
  const session = await authServerProvider.getSession({ headers: await headers() });
  const contacts = session?.user ? await listContactsForUser(session.user.id) : [];
  return (
    <div className="flex-1 w-full h-full p-4 md:p-6 overflow-auto">
      <EstimateView contacts={contacts} />
    </div>
  );
}
