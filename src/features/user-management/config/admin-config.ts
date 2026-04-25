import { Users, Settings } from "lucide-react";
import type { NavItem, NavItemList } from "@/config/types";

export type { NavItem, NavItemList };

export const adminConfig = {
  title: "Admin Panel",
  version: "v1.0.0",
  defaultRoute: "/admin/users",
  rootLabel: "Admin",
  rootHref: "/admin",
  nav: [] satisfies NavItem[],
  footerNav: [] satisfies NavItem[],
  pages: {
    users: {
      title: "Users | Admin Dashboard",
      description: "Manage users in the admin dashboard",
      table: {
        searchPlaceholder: "Search email...",
        addUserLabel: "Add a user",
        errorMessage: "Failed to load users",
        roleOptions: [
          { value: "all", label: "All Roles" },
          { value: "admin", label: "Admin" },
          { value: "user", label: "User" },
        ],
      },
      roleOptions: [
        { label: "User", value: "user" },
        { label: "Admin", value: "admin" },
      ],
      actions: {
        menuLabel: "Actions",
        openMenuSr: "Open menu",
        updateRole: "Update Role",
        banUser: "Ban User",
        unbanUser: "Unban User",
        deleteUser: "Delete User",
        revokeSessions: "Revoke All Sessions",
      },
      banDialog: {
        description: "This will prevent the user from accessing the platform.",
        reasonLabel: "Reason for ban (optional)",
        reasonPlaceholder:
          "Enter reason for banning this user (default: Spamming)",
        durationLabel: "Ban duration",
        durationPlaceholder: "Select duration",
        confirmText: "Ban User",
        confirmingText: "Processing...",
        durations: [
          { label: "1 day", value: "1" },
          { label: "3 days", value: "3" },
          { label: "7 days", value: "7" },
          { label: "14 days", value: "14" },
          { label: "30 days", value: "30" },
          { label: "90 days", value: "90" },
          { label: "Permanent", value: "permanent" },
        ],
      },
      unbanDialog: {
        description: "This will restore the user's access to the platform.",
        confirmText: "Unban User",
        confirmingText: "Processing...",
      },
      deleteDialog: {
        description:
          "This action cannot be undone. This will permanently delete the user and remove their data from the system.",
        confirmText: "Delete User",
        confirmingText: "Processing...",
      },
      revokeSessionsDialog: {
        description:
          "This will log the user out of all devices. They will need to log in again to access their account.",
        confirmText: "Revoke Sessions",
        confirmingText: "Processing...",
      },
      roleDialog: {
        description: "Change the user's role in the system.",
        roleLabel: "Select Role",
        rolePlaceholder: "Select role",
        confirmText: "Update Role",
        confirmingText: "Processing...",
      },
      addDialog: {
        title: "Add New User",
        description: "Create a new user account with the following details.",
        nameLabel: "Name",
        namePlaceholder: "Enter user's name",
        emailLabel: "Email",
        emailPlaceholder: "Enter user's email",
        passwordLabel: "Password",
        passwordPlaceholder: "Enter user's password",
        roleLabel: "Role",
        rolePlaceholder: "Select role",
        autoVerifyLabel: "Auto-verify email",
        confirmText: "Create User",
        confirmingText: "Creating...",
        successVerified: "User created and verified successfully",
        successUnverified:
          "User created successfully. Verification email sent.",
      },
    },
  },
};
