"use client";
import { CheckCircle, XCircle, Ban, Check, Shield, User } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useUsersTable } from "@/features/user-management/hooks/use-users-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design-systems/shadcn/components/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/design-systems/shadcn/components/tooltip";

import { Badge } from "@/design-systems/shadcn/components/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/design-systems/shadcn/components/avatar";
import type { UserWithDetails } from "@/features/user-management/types";
import { GithubIcon, GoogleIcon } from "@/design-systems/shadcn/components/icons";
import { UserActions } from "@/features/user-management/components/table/user-actions";
import { UserAddDialog } from "@/features/user-management/components/dialogs/user-add-dialog";

import { adminConfig } from "@/features/user-management/config/admin-config";
import { formatShowingCount } from "@/features/user-management/utils/format";

import { UsersTableToolbar } from "@/features/user-management/components/table/users-table-toolbar";
import { UsersTableSkeleton } from "@/features/user-management/components/table/users-table-skeleton";
import { UsersTablePagination } from "@/features/user-management/components/table/users-table-pagination";
import { COLUMNS } from "@/features/user-management/components/table/users-table-columns";

// Helper function to render account icons
const getAccountIcon = (account: string) => {
  switch (account) {
    case "credential":
      return <User className="h-4 w-4 dark:text-neutral-300" />;
    case "github":
      return <GithubIcon className="h-4 w-4 dark:text-neutral-300" />;
    case "google":
      return <GoogleIcon className="h-4 w-4 dark:text-neutral-300" />;
    default:
      return null;
  }
};

export function UsersTable() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const { state, mutators, data, error, isLoading } = useUsersTable();
  const { role, email, page } = state;
  const { setRole, setEmail, setPage, mutate } = mutators;

  const handleActionComplete = () => mutate();
  
  const config = adminConfig.pages.users.table;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <UsersTableToolbar
        email={email}
        role={role}
        setEmail={setEmail}
        setRole={setRole}
        setPage={setPage}
        onAddUserClick={() => setIsAddDialogOpen(true)}
      />

      {error ? (
        <div>{config.errorMessage}</div>
      ) : (
        <div className="overflow-hidden rounded-lg border-muted border-2">
          <Table className="text-sm">
            <TableHeader className="bg-muted sticky top-0 z-10">
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableHead
                    key={col.label}
                    className={[
                      ("className" in col) ? col.className : "",
                      "px-4 py-3 text-xs font-medium text-muted-foreground",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            
            {isLoading || !data ? (
              <UsersTableSkeleton />
            ) : (
              <TableBody>
                {data.users.map((user: UserWithDetails) => (
                  <TableRow key={user.id}>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={user.avatarUrl} alt={user.name} />
                          <AvatarFallback className="text-xs">
                            {user.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {user.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {user.email.replace(/^[^@]+/, (match) =>
                              "*".repeat(match.length)
                            )}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {user.verified ? (
                        <Badge
                          variant="outline"
                          className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700 flex items-center gap-1 px-2 py-1 text-xs"
                        >
                          <CheckCircle className="h-3 w-3" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700 flex items-center gap-1 px-2 py-1 text-xs"
                        >
                          <XCircle className="h-3 w-3" />
                          Unverified
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex -space-x-2">
                        {user.accounts.map((account) => (
                          <div
                            key={account}
                            className="rounded-full bg-muted p-1.5 text-muted-foreground dark:bg-neutral-700"
                            title={account}
                          >
                            {getAccountIcon(account)}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`flex items-center gap-1 px-2 py-1 text-xs ${
                          user.role === "admin"
                            ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700"
                            : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700"
                        }`}
                      >
                        {user.role === "admin" ? (
                          <Shield className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                        {user.role
                          ? user.role.charAt(0).toUpperCase() +
                            user.role.slice(1)
                          : "User"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {user.banned ? (
                        <div className="flex flex-col gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="destructive"
                                className="flex items-center gap-1 px-2 py-1 text-xs cursor-help"
                              >
                                <Ban className="h-3 w-3" />
                                Banned
                              </Badge>
                            </TooltipTrigger>
                            {user.banReason && (
                              <TooltipContent>
                                Reason: {user.banReason}
                              </TooltipContent>
                            )}
                          </Tooltip>
                          {user.banExpires && (
                            <span className="text-xs text-muted-foreground">
                              Expires: {format(user.banExpires, "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700 flex items-center gap-1 px-2 py-1 text-xs"
                        >
                          <Check className="h-3 w-3" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {user.lastSignIn
                        ? format(user.lastSignIn, "MMM d, yyyy 'at' h:mm a")
                        : "Never"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {format(user.createdAt, "MMM d, yyyy 'at' h:mm a")}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <UserActions
                        user={user}
                        onActionComplete={handleActionComplete}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      )}

      {data && (
        <div className="flex items-center justify-between px-4 py-1">
          <div className="text-sm text-muted-foreground">
            {formatShowingCount(data.users.length, data.total)}
          </div>
          <UsersTablePagination 
            page={page} 
            totalPages={data.totalPages} 
            setPage={setPage} 
          />
        </div>
      )}

      <UserAddDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={() => mutate()}
      />
    </div>
  );
}

