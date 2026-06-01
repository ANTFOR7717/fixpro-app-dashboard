"use client";

import { useActionState, startTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFormStatus } from "react-dom";
import * as z from "zod";

import { Input } from "@/design-systems/shadcn/components/input";
import { Label } from "@/design-systems/shadcn/components/label";
import { Button } from "@/design-systems/shadcn/components/button";
import { FormError, FormSuccess } from "@/design-systems/shadcn/components/form-messages";
import { createContactAction, updateContactAction } from "../api/actions";
import type { Contact } from "../db/schema";

const contactSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email"),
});

type ContactFormValues = z.infer<typeof contactSchema>;

function SubmitButton({ mode }: { mode: "create" | "update" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : mode === "create" ? "Add contact" : "Save changes"}
    </Button>
  );
}

interface ContactFormProps {
  mode: "create" | "update";
  contact?: Contact;
  onDone?: () => void;
}

export function ContactForm({ mode, contact, onDone }: ContactFormProps) {
  const action = mode === "create" ? createContactAction : updateContactAction;
  const [state, formAction] = useActionState(action, null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      fullName: contact?.fullName ?? "",
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
    },
  });

  // After a successful action, clear the create form so the inputs don't keep stale values
  // (the server component re-renders the list separately via revalidatePath).
  // For update mode, collapse the inline editor by calling onDone.
  useEffect(() => {
    if (state?.success) {
      if (mode === "create") reset({ fullName: "", phone: "", email: "" });
      else onDone?.();
    }
  }, [state, mode, reset, onDone]);

  const onSubmit = (data: ContactFormValues) => {
    const formData = new FormData();
    if (mode === "update" && contact) formData.append("id", contact.id);
    Object.entries(data).forEach(([k, v]) => formData.append(k, v));
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormError message={state?.error || ""} />
      <FormSuccess message={state?.message || ""} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name *</Label>
          <Input id="fullName" {...register("fullName")} />
          {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone *</Label>
          <Input id="phone" type="tel" {...register("phone")} />
          {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>
      </div>
      <SubmitButton mode={mode} />
    </form>
  );
}
