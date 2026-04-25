"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Label } from "@/design-systems/shadcn/components/label";
import type { UserWithDetails } from "@/features/user-management/types";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
import { Textarea } from "@/design-systems/shadcn/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-systems/shadcn/components/select";
import { adminConfig } from "@/features/user-management/config/admin-config";

interface UserBanDialogProps {
  user: UserWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onConfirmBan: (userId: string, reason: string, banExpiresIn?: number) => Promise<void>;
}

export function UserBanDialog({ user, isOpen, onClose, onConfirmBan }: UserBanDialogProps) {
  const [reason, setReason] = useState("");
  const [banDuration, setBanDuration] = useState("7"); // Default to 7 days
  const [isLoading, setIsLoading] = useState(false);

  const handleBanUser = async () => {
    try {
      setIsLoading(true);
      // Convert duration from days to seconds
      let banExpiresIn: number | undefined;
      if (banDuration === "permanent") {
        banExpiresIn = undefined;
      } else {
        banExpiresIn = parseInt(banDuration) * 24 * 60 * 60; // Days to seconds
      }

      await onConfirmBan(user.id, reason, banExpiresIn);
      toast.success(`${user.name || user.email} has been banned.`);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const conf = adminConfig.pages.users.banDialog;

  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleBanUser}
      title={`Ban User: ${user.name || user.email}`}
      description={conf.description}
      confirmText={isLoading ? conf.confirmingText : conf.confirmText}
      confirmVariant="destructive"
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="reason">{conf.reasonLabel}</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={conf.reasonPlaceholder}
            className="resize-none"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="banDuration">{conf.durationLabel}</Label>
          <Select value={banDuration} onValueChange={setBanDuration}>
            <SelectTrigger id="banDuration" className="w-full">
              <SelectValue placeholder={conf.durationPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {conf.durations.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="hover:bg-muted"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </ConfirmationDialog>
  );
}
