import { db } from "@/db";
import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
import type { UserWithDetails, GetUsersOptions } from "@/features/user-management/types";

export async function getUsers(
  options: GetUsersOptions = {},
): Promise<{ users: UserWithDetails[]; total: number }> {
  // Build query for Better Auth
  const query: Record<string, any> = {
    limit: options.limit ?? 10,
    offset: options.offset ?? 0,
  };

  if (options.sortBy) query.sortBy = options.sortBy;
  if (options.sortDirection) query.sortDirection = options.sortDirection;

  if (options.role) {
    query.filterField = "role";
    query.filterOperator = "eq";
    query.filterValue = options.role;
  }

  if (options.status) {
    query.filterField = "banned";
    query.filterOperator = "eq";
    query.filterValue = options.status === "banned" ? true : false;
  }

  if (options.email) {
    query.searchField = "email";
    query.searchOperator = "contains";
    query.searchValue = options.email;
  }

  if (options.name) {
    query.searchField = "name";
    query.searchOperator = "contains";
    query.searchValue = options.name;
  }

  const result = await authServerProvider.listUsers({
    headers: await headers(),
    query,
  });

  if (!result || !result.users) {
    return { users: [], total: 0 };
  }

  const accountsQuery = await db.query.account.findMany({
    columns: { userId: true, providerId: true },
  });

  const sessionsQuery = await db.query.session.findMany({
    columns: { userId: true, createdAt: true },
    orderBy: (session) => [session.createdAt],
  });

  const accountsByUser = accountsQuery.reduce((acc, account) => {
    if (!acc[account.userId]) acc[account.userId] = [];
    acc[account.userId].push(account.providerId);
    return acc;
  }, {} as Record<string, string[]>);

  const lastSignInByUser = sessionsQuery.reduce((acc, session) => {
    if (!acc[session.userId] || session.createdAt > acc[session.userId]) {
      acc[session.userId] = session.createdAt;
    }
    return acc;
  }, {} as Record<string, Date>);

  const users: UserWithDetails[] = (result.users as any[]).map((user: any) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    verified: user.emailVerified,
    role: user.role,
    banned: user.banned ?? false,
    banReason: user.banReason || "",
    banExpires: user.banExpires || null,
    accounts: accountsByUser[user.id] || [],
    lastSignIn: lastSignInByUser[user.id] || null,
    createdAt: user.createdAt,
    avatarUrl: user.image || "",
  }));

  return { users, total: result.total ?? users.length };
}
