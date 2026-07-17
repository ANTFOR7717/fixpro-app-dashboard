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
    <div className="mx-auto w-full max-w-4xl space-y-8 p-0">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">
          Save agents you work with so you don&apos;t have to retype them on every estimate.
        </p>
      </div>

      <Card className="shadow-none">
        <CardContent className="space-y-6 pt-6">
          <ContactForm mode="create" />
          <Separator />
          {contacts.length === 0 ? (
            <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No saved contacts yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {contacts.map((c) => (
                <li key={c.id} className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
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
