# STYLE(good-shepherd-rebrand)

## Request
Remove all scattered instances of the legacy "Zexa" brand across the marketing site, dashboard, and global structure. Replace "Zexa" (the past author) with "Good Shepherd Insights", and appropriately refer to the project itself as the "Multi-Tenant SaaS Starter".

## Directory Map
```text
src/
  features/
    marketing/
      components/
        animated-hero.tsx       (modify)
        footer.tsx              (modify)
        navbar.tsx              (modify)
    dashboard/
      config/
        dashboard-config.ts     (modify)
  app/
    layout.tsx                  (modify)
    auth/
      login/
        login-page-client.tsx   (modify)
      register/
        register-page-client.tsx(modify)
package.json                    (modify)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/features/marketing/components/animated-hero.tsx` | Modify | Update placeholder URLs and UI labels to Good Shepherd Insights. |
| `src/features/marketing/components/footer.tsx` | Modify | Update footer credits to Good Shepherd Insights. |
| `src/features/marketing/components/navbar.tsx` | Modify | Update main header brand logo text to Multi-Tenant SaaS Starter. |
| `src/features/dashboard/config/dashboard-config.ts` | Modify | Update document metadata title and open-source URLs. |
| `src/app/layout.tsx` | Modify | Update global app boundary title. |
| `src/app/auth/login/login-page-client.tsx` | Modify | Update authentication flow brand text. |
| `src/app/auth/register/register-page-client.tsx` | Modify | Update authentication flow brand text. |
| `package.json` | Modify | Update node module author and repository fields. |

## Execution Plan
### Step 1 — Application Metadata & Config
Update the static configurations inside `package.json`, `layout.tsx`, and `dashboard-config.ts`.
### Step 2 — Authentication Flows
Update the `login-page-client.tsx` and `register-page-client.tsx` structural headers.
### Step 3 — Marketing Site Components
Update the visible components inside `navbar.tsx`, `footer.tsx`, and `animated-hero.tsx`.

## File-by-File Changes

### `package.json`
**Action:** Modify  
**Why:** Clears legacy repo origin URLs and authorship.  

#### Before
```json
  "author": "Zexa",
  "license": "MIT",
  "homepage": "https://zexa.app",
  "repository": {
    "type": "git",
    "url": "https://github.com/zexahq/better-auth-starter"
  },
```

#### After
```json
  "author": "Good Shepherd Insights",
  "license": "MIT",
  "homepage": "https://goodshepherdinsights.com",
  "repository": {
    "type": "git",
    "url": "https://github.com/good-shepherd-insights/multi-tenant-saas-starter"
  },
```

---

### `src/app/layout.tsx`
**Action:** Modify  
**Why:** Rebrands Document Title  

#### Before
```tsx
export const metadata: Metadata = {
  title: "Zexa Better Auth",
  description: "A Next.js boilerplate for building web applications",
};
```

#### After
```tsx
export const metadata: Metadata = {
  title: "Multi-Tenant SaaS Starter",
  description: "A Next.js boilerplate for building web applications",
};
```

---

### `src/features/dashboard/config/dashboard-config.ts`
**Action:** Modify  
**Why:** Fixes sub-view metadata titles and footer config.  

#### Before
```ts
      title: "Dashboard | Zexa Better Auth",
      description: "Your personal dashboard overview.",
```
```ts
        label: "View Source",
        href: "https://github.com/zexahq/better-auth-starter",
```
```ts
        label: "Documentation",
        href: "https://github.com/zexahq/better-auth-starter",
```

#### After
```ts
      title: "Dashboard | SaaS Starter",
      description: "Your personal dashboard overview.",
```
```ts
        label: "View Source",
        href: "https://github.com/good-shepherd-insights/multi-tenant-saas-starter",
```
```ts
        label: "Documentation",
        href: "https://github.com/good-shepherd-insights/multi-tenant-saas-starter",
```

---

### `src/app/auth/login/login-page-client.tsx`
**Action:** Modify  
**Why:** Rebrands auth header.  

#### Before
```tsx
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEnd className="size-4" />
          </div>
          Zexa Better Auth
        </a>
```

#### After
```tsx
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEnd className="size-4" />
          </div>
          Multi-Tenant SaaS Starter
        </a>
```

---

### `src/app/auth/register/register-page-client.tsx`
**Action:** Modify  
**Why:** Rebrands auth header.  

#### Before
```tsx
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEnd className="size-4" />
          </div>
          Zexa Better Auth
        </a>
```

#### After
```tsx
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEnd className="size-4" />
          </div>
          Multi-Tenant SaaS Starter
        </a>
```

---

### `src/features/marketing/components/navbar.tsx`
**Action:** Modify  
**Why:** Fixes main branding header.  

#### Before
```tsx
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-5 h-5" />
            </Button>
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Zexa Logo"
                width={24}
                height={24}
                className="w-8 h-8 rounded-md"
              />
              <span className="font-bold text-xl">Zexa Better Auth Starter</span>
            </Link>
```

#### After
```tsx
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-5 h-5" />
            </Button>
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Good Shepherd Insights Logo"
                width={24}
                height={24}
                className="w-8 h-8 rounded-md"
              />
              <span className="font-bold text-xl">Multi-Tenant SaaS Starter</span>
            </Link>
```

---

### `src/features/marketing/components/footer.tsx`
**Action:** Modify  
**Why:** Footer credits update.  

#### Before
```tsx
        <p className="text-sm text-muted-foreground w-full flex align-center">
          Built with ❤️ by{" "}
          <Link
            className="text-primary mx-1"
            href="https://zexa.app"
            target="_blank"
          >
            Zexa
          </Link>
```

#### After
```tsx
        <p className="text-sm text-muted-foreground w-full flex align-center">
          Built with ❤️ by{" "}
          <Link
            className="text-primary mx-1"
            href="https://goodshepherdinsights.com"
            target="_blank"
          >
            Good Shepherd Insights
          </Link>
```

---

### `src/features/marketing/components/animated-hero.tsx`
**Action:** Modify  
**Why:** Clears main content blocks tracking back to Zexa.  

#### Before
```tsx
            <Button variant="secondary" size="sm" className="gap-4" asChild>
              <a
                href="https://www.zexa.app"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  src="/logo.png"
                  alt="Zexa"
                  width={16}
                  height={16}
                  className="w-4 h-4"
                />
                Built by Zexa <MoveRight className="w-4 h-4" />
              </a>
            </Button>
```
```tsx
            <Button size="lg" className="gap-4" asChild>
              <a
                href="https://github.com/zexahq/better-auth-starter"
                target="_blank"
                rel="noopener noreferrer"
              >
                Check GitHub Repo <MoveRight className="w-4 h-4" />
              </a>
            </Button>
```

#### After
```tsx
            <Button variant="secondary" size="sm" className="gap-4" asChild>
              <a
                href="https://goodshepherdinsights.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  src="/logo.png"
                  alt="Good Shepherd Insights"
                  width={16}
                  height={16}
                  className="w-4 h-4"
                />
                Built by Good Shepherd Insights <MoveRight className="w-4 h-4" />
              </a>
            </Button>
```
```tsx
            <Button size="lg" className="gap-4" asChild>
              <a
                href="https://github.com/good-shepherd-insights/multi-tenant-saas-starter"
                target="_blank"
                rel="noopener noreferrer"
              >
                Check GitHub Repo <MoveRight className="w-4 h-4" />
              </a>
            </Button>
```

## Validation Plan
1. Execution: `multi_replace_file_content` script using strict substring replacement.
2. Verify: Pre-compiler static string inspection running `npm run build`.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
