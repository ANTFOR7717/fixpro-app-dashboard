import { BetterAuthServer } from "./adapters/better-auth/server";
import type { IAuthServerAdapter } from "./types";

export const authServerProvider: IAuthServerAdapter = new BetterAuthServer();
