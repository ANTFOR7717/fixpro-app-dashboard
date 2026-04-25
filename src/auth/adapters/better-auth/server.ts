import { auth } from "@/lib/auth";
import { APIError } from "better-auth/api";
import { toNextJsHandler } from "better-auth/next-js";
import { DEFAULT_LOGIN_REDIRECT } from "@/lib/config";
import { AuthError } from "../../types";
import type { IAuthServerAdapter, GenericSession, IAuthRouteHandler } from "../../types";

export class BetterAuthServer implements IAuthServerAdapter {
  async getSession(options?: { headers: any }) {
    const session = await auth.api.getSession(options);
    return session as unknown as GenericSession | null;
  }

  async listUsers(options?: { headers: any; query: any }) {
    const result = await (auth.api as any).listUsers(options);
    if (!result) return null;
    return { users: result.users, total: result.total ?? result.users.length };
  }

  getRouteHandler(): IAuthRouteHandler {
    const { GET, POST } = toNextJsHandler(auth);
    return { GET, POST };
  }

  async signInEmail(email: string, pass: string) {
    try {
      return await auth.api.signInEmail({ body: { email, password: pass } });
    } catch (error: any) {
      if (error instanceof APIError) {
        throw new AuthError(error.body?.message || "Login failed", error.status as string);
      }
      throw error;
    }
  }

  async signUpEmail(email: string, pass: string, name: string) {
    try {
      return await auth.api.signUpEmail({ 
        body: { email, password: pass, name, callbackURL: DEFAULT_LOGIN_REDIRECT } 
      });
    } catch (error: any) {
      if (error instanceof APIError) {
        throw new AuthError(error.body?.message || "Registration failed", error.status as string);
      }
      throw error;
    }
  }

  async sendVerificationEmail(email: string) {
    try {
      return await auth.api.sendVerificationEmail({ 
        body: { email, callbackURL: DEFAULT_LOGIN_REDIRECT } 
      });
    } catch (error: any) {
      if (error instanceof APIError) {
        throw new AuthError(error.body?.message || "Verification email failed", error.status as string);
      }
      throw error;
    }
  }
}
