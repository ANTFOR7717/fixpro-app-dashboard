# ⚠️ MUST FIX FOR PRODUCTION

This file tracks security shortcuts and temporary workarounds applied during local development. **Do not ship to production until all items are resolved.**

---

## 1. SSL Certificate Verification Disabled on Database Connection

**File:** `src/db/index.ts`

**Current (unsafe):**
```ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
```

**Why it exists:** Supabase's transaction pooler (port `6543`) presents a self-signed certificate that Node.js rejects by default. `rejectUnauthorized: false` was the fastest local workaround.

**Production fix:** Switch to Supabase's **session mode pooler (port `5432`)** or the **direct connection string** — both use a valid certificate chain. Update `DATABASE_URL` to the direct/session URL from your Supabase dashboard (`Project Settings → Database → Connection string → URI`), then restore:

```ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true, // or: ssl: { rejectUnauthorized: true }
});
```

> **Note:** The `?sslmode=require&supa=base-pooler.x` query params were stripped from `DATABASE_URL` in `.env` and `.env.local` because `pg`'s connection-string parser was overriding the explicit `ssl:` object in the Pool config, causing the cert rejection to persist even with `rejectUnauthorized: false`. SSL is now handled exclusively via the Pool config. When switching to the direct connection string for production, you may safely add `?sslmode=require` back or leave SSL control in the Pool config — both are equivalent.

---

## 2. `NODE_TLS_REJECT_UNAUTHORIZED=0` Used for CLI Commands

**Commands affected:** `pnpm db:migrate`, `pnpm db:studio`

**Why it exists:** Same Supabase pooler SSL issue as above. The environment variable was prefixed at the CLI to unblock migration runs.

**Production fix:** Resolved automatically once issue #1 is fixed by switching to the direct connection string. Remove this prefix from any CI/CD pipeline scripts.

---
