import { authServerProvider } from "@/auth/server-provider";

export const { GET, POST } = authServerProvider.getRouteHandler();
