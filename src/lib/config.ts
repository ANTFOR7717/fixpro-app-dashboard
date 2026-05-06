const DEFAULT_LOGIN_REDIRECT = "/dashboard";

const rawUrl = process.env.NODE_ENV === "production"
  ? (process.env.PRODUCTION_URL || "https://fixpro-app-dashboard.vercel.app")
  : (process.env.DEV_URL || "http://localhost:3000");

// Strip trailing slash to prevent better-auth INVALID_ORIGIN errors
const APP_URL = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;

export { DEFAULT_LOGIN_REDIRECT, APP_URL };
