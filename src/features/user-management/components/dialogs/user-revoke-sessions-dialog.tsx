"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { revokeUserSessions } from "@/features/user-management/api/admin-actions";
import type { UserWithDetails } from "@/features/user-management/types";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";

interface UserRevokeSessionsDialogProps {
  user: UserWithDetails;
  isOpen: boolean;
  onClose: () => void;
}

export function UserRevokeSessionsDialog({
  user,
  isOpen,
  onClose,
}: UserRevokeSessionsDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleRevokeSessions = async () => {
    try {
      setIsLoading(true);
      await revokeUserSessions(user.id);
      toast.success(
        `All sessions for ${user.name || user.email} have been revoked.`,
      );
      onClose();
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const conf = adminConfig.pages.users.revokeSessionsDialog;

  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleRevokeSessions}
      title={`Revoke Sessions: ${user.name || user.email}`}
      description={conf.description}
      confirmText={isLoading ? conf.confirmingText : conf.confirmText}
      confirmVariant="destructive"
    />
  );
}
