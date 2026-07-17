"use client";

import { Label } from "@/design-systems/shadcn/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-systems/shadcn/components/select";
import type { Contact } from "../db/schema";

interface ContactPickerProps {
  label: string;
  contacts: Contact[];
  onSelect: (c: { fullName: string; phone: string; email: string }) => void;
}

const MANUAL_VALUE = "__manual__";

export function ContactPicker({ label, contacts, onSelect }: ContactPickerProps) {
  const handleChange = (value: string) => {
    if (value === MANUAL_VALUE) {
      onSelect({ fullName: "", phone: "", email: "" });
      return;
    }
    const c = contacts.find((x) => x.id === value);
    if (c) onSelect({ fullName: c.fullName, phone: c.phone, email: c.email });
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select onValueChange={handleChange} defaultValue={MANUAL_VALUE}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a saved contact or enter manually" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={MANUAL_VALUE}>— Enter manually —</SelectItem>
          {contacts.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.fullName} · {c.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
