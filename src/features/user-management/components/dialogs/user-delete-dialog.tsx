"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { deleteUser } from "@/features/user-management/api/admin-actions";
import type { UserWithDetails } from "@/features/user-management/types";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";

interface UserDeleteDialogProps {
  user: UserWithDetails;
  isOpen: boolean;
  onClose: () => void;
}

export function UserDeleteDialog({
  user,
  isOpen,
  onClose,
}: UserDeleteDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDeleteUser = async () => {
    try {
      setIsLoading(true);
      await deleteUser(user.id);
      toast.success(`${user.name || user.email} has been deleted.`);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const conf = adminConfig.pages.users.deleteDialog;

  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleDeleteUser}
      title={`Delete User: ${user.name || user.email}`}
      description={conf.description}
      confirmText={isLoading ? conf.confirmingText : conf.confirmText}
      confirmVariant="destructive"
    />
  );
}
