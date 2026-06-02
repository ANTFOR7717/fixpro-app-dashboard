import type { FeatureMetadata } from "@/lib/registry";
import { ContactsView } from "./components/contacts-view";

export const contactsMetadata: FeatureMetadata = {
  id: "contacts",
  name: "Contacts",
  navigation: [
    {
      href: "/dashboard/contacts",
      label: "Contacts",
      icon: "users",
      position: "sidebar",
    },
  ],
  page: <ContactsView />,
};
