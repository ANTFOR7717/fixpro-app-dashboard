import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { DEFAULT_LOGIN_REDIRECT } from "@/lib/config";
import type { IAuthClientAdapter, GenericSession } from "../../types";
import { AuthError } from "../../types";

export const client = createAuthClient({ plugins: [adminClient()] });

export class BetterAuthClient implements IAuthClientAdapter {
  useSession() {
    const sessionRes = client.useSession();
    return { 
      data: sessionRes.data as unknown as GenericSession | null, 
      isPending: sessionRes.isPending, 
      error: sessionRes.error 
    };
  }

  async signOut() {
    await client.signOut();
  }

  async signInEmail(email: string, password: string) {
    const { error } = await client.signIn.email({ email, password });

    if (error) {
      throw new AuthError(error.message || "Login failed", error.statusText);
    }
  }

  async signInWithGithub() {
    await client.signIn.social({ provider: "github", callbackURL: DEFAULT_LOGIN_REDIRECT });
  }

  async signInWithGoogle() {
    await client.signIn.social({ provider: "google", callbackURL: DEFAULT_LOGIN_REDIRECT });
  }

  async sendVerificationEmail(options: { email: string; callbackURL: string }) {
    await client.sendVerificationEmail(options);
  }

  admin = {
    banUser: async (userId: string, banReason: string, expiresIn?: number) => client.admin.banUser({ userId, banReason, banExpiresIn: expiresIn }),
    unbanUser: async (userId: string) => client.admin.unbanUser({ userId }),
    revokeUserSessions: async (userId: string) => client.admin.revokeUserSessions({ userId }),
    setRole: async (userId: string, role: string) => client.admin.setRole({ userId, role: role as any }),
    removeUser: async (userId: string) => client.admin.removeUser({ userId }),
    createUser: async (data: any) => client.admin.createUser(data),
  };
}
