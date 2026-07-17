import { headers } from "next/headers";
import { authServerProvider } from "@/auth/server-provider";
import { Card, CardContent } from "@/design-systems/shadcn/components/card";
import { Separator } from "@/design-systems/shadcn/components/separator";
import { listContactsForUser } from "../api/get-contacts";
import { ContactForm } from "./contact-form";
import { ContactRowActions } from "./contact-row-actions";

export async function ContactsView() {
  const session = await authServerProvider.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const contacts = await listContactsForUser(session.user.id);

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">
          Save agents you work with so you don&apos;t have to retype them on every estimate.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <ContactForm mode="create" />
          <Separator />
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved contacts yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {contacts.map((c) => (
                <li key={c.id} className="py-4 flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-semibold">{c.fullName}</p>
                    <p className="text-sm text-muted-foreground">{c.email}</p>
                    <p className="text-sm text-muted-foreground">{c.phone}</p>
                  </div>
                  <ContactRowActions contact={c} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
