"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { unbanUser } from "@/features/user-management/api/admin-actions";
import type { UserWithDetails } from "@/features/user-management/types";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";

interface UserUnbanDialogProps {
  user: UserWithDetails;
  isOpen: boolean;
  onClose: () => void;
}

export function UserUnbanDialog({
  user,
  isOpen,
  onClose,
}: UserUnbanDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleUnbanUser = async () => {
    try {
      setIsLoading(true);
      await unbanUser(user.id);
      toast.success(`${user.name || user.email} has been unbanned.`);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const conf = adminConfig.pages.users.unbanDialog;

  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleUnbanUser}
      title={`Unban User: ${user.name || user.email}`}
      description={conf.description}
      confirmText={isLoading ? conf.confirmingText : conf.confirmText}
    />
  );
}
