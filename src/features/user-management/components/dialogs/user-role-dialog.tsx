"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { updateUserRole } from "@/features/user-management/api/admin-actions";
import { Label } from "@/design-systems/shadcn/components/label";
import type { UserWithDetails } from "@/features/user-management/types";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-systems/shadcn/components/select";
import { adminConfig } from "@/features/user-management/config/admin-config";

interface UserRoleDialogProps {
  user: UserWithDetails;
  isOpen: boolean;
  onClose: () => void;
}

export function UserRoleDialog({ user, isOpen, onClose }: UserRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState(user.role || "user");
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdateRole = async () => {
    try {
      setIsLoading(true);
      await updateUserRole(user.id, selectedRole);
      toast.success(`User role updated to ${selectedRole}`);
      onClose();
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const conf = adminConfig.pages.users.roleDialog;

  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleUpdateRole}
      title={`Update Role: ${user.name || user.email}`}
      description={conf.description}
      confirmText={isLoading ? conf.confirmingText : conf.confirmText}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="role">{conf.roleLabel}</Label>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger id="role" className="w-full">
              <SelectValue placeholder={conf.rolePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {adminConfig.pages.users.roleOptions.map((option) => (
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
