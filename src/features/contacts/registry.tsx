import { Users } from "lucide-react";
import type { FeatureMetadata } from "@/lib/registry";
import { ContactsView } from "./components/contacts-view";

export const contactsMetadata: FeatureMetadata = {
  id: "contacts",
  name: "Contacts",
  navigation: [
    {
      href: "/dashboard/contacts",
      label: "Contacts",
      icon: Users,
      position: "sidebar",
    },
  ],
  page: <ContactsView />,
};
