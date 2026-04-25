export interface GenericSession {
  user: { id: string; name: string; email: string; role?: string; banned?: boolean; image?: string };
  session: { id: string; expiresAt: Date; ipAddress?: string; userAgent?: string };
}

export interface IAuthRouteHandler {
  GET: any;
  POST: any;
}

export interface IAuthClientAdapter {
  useSession: () => { data: GenericSession | null; isPending?: boolean; error?: any };
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  sendVerificationEmail: (options: { email: string; callbackURL: string }) => Promise<void>;
  admin: {
    banUser: (userId: string, banReason: string, expiresIn?: number) => Promise<any>;
    unbanUser: (userId: string) => Promise<any>;
    revokeUserSessions: (userId: string) => Promise<any>;
    setRole: (userId: string, role: string) => Promise<any>;
    removeUser: (userId: string) => Promise<any>;
    createUser: (data: any) => Promise<any>;
  };
}

export interface IAuthServerAdapter {
  getSession: (options?: { headers: any }) => Promise<GenericSession | null>;
  listUsers: (options?: { headers: any; query: any }) => Promise<{ users: any[]; total: number } | null>;
  getRouteHandler: () => IAuthRouteHandler;
  signInEmail: (email: string, pass: string) => Promise<any>;
  signUpEmail: (email: string, pass: string, name: string) => Promise<any>;
}

export class AuthError extends Error {
  body: { message?: string };
  status?: string;
  constructor(message: string, status?: string) {
    super(message);
    this.body = { message };
    this.status = status;
  }
}
