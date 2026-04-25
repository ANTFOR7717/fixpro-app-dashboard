const DEFAULT_LOGIN_REDIRECT = "/dashboard";

const APP_URL = process.env.NODE_ENV === "production"
  ? process.env.PRODUCTION_URL
  : (process.env.DEV_URL || "http://localhost:3000");

export { DEFAULT_LOGIN_REDIRECT, APP_URL };
