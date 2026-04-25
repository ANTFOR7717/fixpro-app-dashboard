"use client";

import { useState } from "react";
import { Ban, MoreHorizontal, Trash2, Shield, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/design-systems/shadcn/components/dropdown-menu";
import { Button } from "@/design-systems/shadcn/components/button";
import type { UserWithDetails } from "@/features/user-management/types";
import { banUser } from "@/features/user-management/api/admin-actions";
import { UserBanDialog } from "@/features/user-management/components/dialogs/user-ban-dialog";
import { UserUnbanDialog } from "@/features/user-management/components/dialogs/user-unban-dialog";
import { UserDeleteDialog } from "@/features/user-management/components/dialogs/user-delete-dialog";
import { UserRevokeSessionsDialog } from "@/features/user-management/components/dialogs/user-revoke-sessions-dialog";
import { UserRoleDialog } from "@/features/user-management/components/dialogs/user-role-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";

interface UserActionsProps {
  user: UserWithDetails;
  onActionComplete: () => void;
}

export function UserActions({ user, onActionComplete }: UserActionsProps) {
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [showUnbanDialog, setShowUnbanDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRevokeSessionsDialog, setShowRevokeSessionsDialog] =
    useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleDialogClose = (
    setter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    setter(false);
  };

  const actionsCopy = adminConfig.pages.users.actions;

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">{actionsCopy.openMenuSr}</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-sm">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {actionsCopy.menuLabel}
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="text-xs"
            onClick={() => {
              setDropdownOpen(false);
              setShowRoleDialog(true);
            }}
          >
            <Shield className="mr-2 h-4 w-4" />
            <span>{actionsCopy.updateRole}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.banned ? (
            <DropdownMenuItem
              className="text-xs"
              onClick={() => {
                setDropdownOpen(false);
                setShowUnbanDialog(true);
              }}
            >
              <Ban className="mr-2 h-4 w-4" />
              <span>{actionsCopy.unbanUser}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-xs"
              onClick={() => {
                setDropdownOpen(false);
                setShowBanDialog(true);
              }}
            >
              <Ban className="mr-2 h-4 w-4" />
              <span>{actionsCopy.banUser}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-xs"
            onClick={() => {
              setDropdownOpen(false);
              setShowDeleteDialog(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{actionsCopy.deleteUser}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            onClick={() => {
              setDropdownOpen(false);
              setShowRevokeSessionsDialog(true);
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>{actionsCopy.revokeSessions}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialogs */}
      <UserBanDialog
        user={user}
        isOpen={showBanDialog}
        onConfirmBan={async (id, reason, expiresIn) => {
          await banUser(id, reason, expiresIn);
        }}
        onClose={() => {
          handleDialogClose(setShowBanDialog);
          onActionComplete();
        }}
      />

      <UserUnbanDialog
        user={user}
        isOpen={showUnbanDialog}
        onClose={() => {
          handleDialogClose(setShowUnbanDialog);
          onActionComplete();
        }}
      />

      <UserDeleteDialog
        user={user}
        isOpen={showDeleteDialog}
        onClose={() => {
          handleDialogClose(setShowDeleteDialog);
          onActionComplete();
        }}
      />

      <UserRevokeSessionsDialog
        user={user}
        isOpen={showRevokeSessionsDialog}
        onClose={() => {
          handleDialogClose(setShowRevokeSessionsDialog);
          onActionComplete();
        }}
      />

      <UserRoleDialog
        user={user}
        isOpen={showRoleDialog}
        onClose={() => {
          handleDialogClose(setShowRoleDialog);
          onActionComplete();
        }}
      />
    </>
  );
}
