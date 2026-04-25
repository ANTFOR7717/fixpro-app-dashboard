import { BetterAuthClient } from "./adapters/better-auth/client";
import type { IAuthClientAdapter } from "./types";

export const authClientProvider: IAuthClientAdapter = new BetterAuthClient();
