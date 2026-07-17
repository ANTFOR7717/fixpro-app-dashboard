"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { Button } from "@/design-systems/shadcn/components/button";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
import { deleteContactAction } from "../api/actions";
import { ContactForm } from "./contact-form";
import type { Contact } from "../db/schema";

interface ContactRowActionsProps {
  contact: Contact;
}

export function ContactRowActions({ contact }: ContactRowActionsProps) {
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("id", contact.id);
      const result = await deleteContactAction(null, formData);
      if (result.success) toast.success("Contact deleted.");
      else toast.error(result.error ?? "Failed to delete contact.");
      setConfirmOpen(false);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel" : "Edit"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          Delete
        </Button>
      </div>
      {editing && (
        <ContactForm mode="update" contact={contact} onDone={() => setEditing(false)} />
      )}
      <ConfirmationDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title={`Delete ${contact.fullName}?`}
        description="This will remove the saved contact. Estimates already submitted with this contact's details are unaffected."
        confirmText={isPending ? "Deleting..." : "Delete"}
        confirmVariant="destructive"
      />
    </div>
  );
}
