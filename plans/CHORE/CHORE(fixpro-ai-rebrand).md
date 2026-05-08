# CHORE(fixpro-ai-rebrand)

## Request

Rebrand every user-facing content reference from the current "Multi-Tenant SaaS Starter" / "Good Shepherd Insights" identity to **Fix Pro AI** — the company behind fixpro.ai. The website at `https://vermilion-crayon.cloudvent.net/` defines the canonical brand positioning:

- **Product**: AI-powered platform that turns home inspection reports into free repair quotes in ≤5 minutes
- **Value props**: Speed (5-minute quotes), licensed & insured contractors, flexible billing (escrow), automated repair cost shopping, near-perfect estimates
- **Brand name**: Fix Pro AI / FixPro
- **Domain**: fixpro.ai
- **Tone**: Confident, witty, technically competent

This plan covers all source files containing branding strings, marketing copy, metadata, external links, the color theme tokens, and the public logo asset. No structural or architectural changes are made.

---

## Directory Map

```text
src/
  app/
    globals.css                                   (modify)
    layout.tsx                                    (modify)
    auth/
      login/login-page-client.tsx                 (modify)
      register/register-page-client.tsx           (modify)
    dashboard/
      client.tsx                                  (modify)
  features/
    marketing/
      components/
        animated-hero.tsx                         (modify)
        features-grid.tsx                         (modify)
        footer.tsx                                (modify)
        navbar.tsx                                (modify)
        tech-stack.tsx                            (modify)
    dashboard/
      registry.ts                                 (modify)
      config/
        dashboard-config.ts                       (modify)
      components/
        overview/
          dashboard-overview.tsx                  (modify)
package.json                                      (modify)
public/
  logo.png                                        (modify — replace asset)
```

---

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/app/globals.css` | Modify | Replace zinc/neutral OKLCH color tokens with FixPro mint-green/teal brand palette (light + dark mode) |
| `src/app/layout.tsx` | Modify | Update `<Metadata>` title and description to Fix Pro AI branding |
| `src/app/auth/login/login-page-client.tsx` | Modify | Replace "Multi-Tenant SaaS Starter" brand label on login screen |
| `src/app/auth/register/register-page-client.tsx` | Modify | Replace "Multi-Tenant SaaS Starter" brand label on register screen |
| `src/app/dashboard/client.tsx` | Modify | Replace sidebar `title="SaaS Starter"` with "Fix Pro AI" |
| `src/features/marketing/components/animated-hero.tsx` | Modify | Rewrite hero section: rotating words, headline, subheadline, CTA buttons, and "Built by" badge to match Fix Pro AI messaging |
| `src/features/marketing/components/features-grid.tsx` | Modify | Replace feature cards (auth, user mgmt, database, UI) with Fix Pro AI service features (5-min quotes, licensed contractors, escrow billing, automated pricing) |
| `src/features/marketing/components/footer.tsx` | Modify | Replace footer attribution from Good Shepherd Insights to Fix Pro AI |
| `src/features/marketing/components/navbar.tsx` | Modify | Update logo alt text and brand name from "Multi-Tenant SaaS Starter" to "Fix Pro AI" |
| `src/features/marketing/components/tech-stack.tsx` | Modify | Replace dev tech stack badges with Fix Pro AI platform capabilities/value props |
| `src/features/dashboard/registry.ts` | Modify | Update "Documentation" quick action link from GitHub repo to fixpro.ai |
| `src/features/dashboard/config/dashboard-config.ts` | Modify | Update dashboard page title and "Documentation" quick action link |
| `src/features/dashboard/components/overview/dashboard-overview.tsx` | Modify | Replace inline "Tech Stack" card with Fix Pro AI platform capabilities |
| `package.json` | Modify | Update `name`, `description`, `author`, `homepage`, and `repository` fields |
| `public/logo.png` | Replace | Swap Good Shepherd Insights logo for Fix Pro AI logo (generate via image tool) |

---

## Existing Pattern Audit

### Naming & File Placement
- Marketing components live at `src/features/marketing/components/` and are imported directly by `src/app/page.tsx` (no registry.ts — imported at the page level).
- All components use shadcn/ui primitives from `@/design-systems/shadcn/components/`.
- Client components are marked with `"use client"` directive.

### Styling
- Tailwind CSS v4 via `@theme inline` in `globals.css`, OKLCH tokens.
- No raw CSS in marketing components — all utility-class-driven.

### Branding Surface
- Branding is scattered across 14 files in 5 distinct patterns:
  1. **Metadata strings** (layout.tsx title/description)
  2. **UI text** (navbar brand name, login/register brand label, hero copy, features copy, footer attribution, sidebar title, dashboard overview)
  3. **External links** (`goodshepherdinsights.com`, GitHub repo URL)
  4. **Logo asset** (`public/logo.png` referenced in navbar and hero via Next.js `<Image>`)
  5. **Color theme tokens** (`globals.css` — OKLCH design tokens for light/dark mode, currently zinc/neutral, needs mint-green/teal)

### Import Pattern
- Components import from `@/design-systems/shadcn/components/[component]`.
- Icons from `lucide-react`.
- `framer-motion` used in hero for animated text transitions.

---

## Execution Plan

### Step 1 — Apply FixPro brand color theme
Replace all OKLCH color tokens in globals.css with a mint-green/teal palette matching the FixPro website.
- Files: `src/app/globals.css`

### Step 2 — Replace metadata and package identity
Update root layout metadata and `package.json` to reflect Fix Pro AI.
- Files: `src/app/layout.tsx`, `package.json`

### Step 3 — Rebrand auth screens
Update the brand label shown on login and register pages.
- Files: `src/app/auth/login/login-page-client.tsx`, `src/app/auth/register/register-page-client.tsx`

### Step 4 — Rewrite marketing hero
Replace the animated hero with Fix Pro AI messaging: rotating words, headline, subtitle, and CTA buttons.
- Files: `src/features/marketing/components/animated-hero.tsx`

### Step 5 — Rewrite features grid
Replace the four developer-focused feature cards with Fix Pro AI service features matching the website content.
- Files: `src/features/marketing/components/features-grid.tsx`

### Step 6 — Rebrand navbar, footer, and tech stack
Update navbar brand text/logo alt, footer attribution, and tech stack section.
- Files: `navbar.tsx`, `footer.tsx`, `tech-stack.tsx`

### Step 7 — Update dashboard config, registry, overview, and sidebar title
Point internal links and titles toward Fix Pro AI. Update sidebar title and dashboard overview tech stack.
- Files: `src/features/dashboard/registry.ts`, `src/features/dashboard/config/dashboard-config.ts`, `src/app/dashboard/client.tsx`, `src/features/dashboard/components/overview/dashboard-overview.tsx`

### Step 8 — Replace logo asset
Generate a new Fix Pro AI logo and overwrite `public/logo.png`.
- Files: `public/logo.png`

---

## File-by-File Changes

### `src/app/globals.css`

**Action:** Modify  
**Why:** Current OKLCH color tokens produce a zinc/neutral grayscale palette — the FixPro website uses a distinctive mint-green/teal brand palette  
**Impact:** Every component using `bg-primary`, `text-primary`, `bg-accent`, `ring`, sidebar colors, and chart colors will shift to the FixPro green palette

#### Before (`:root` — Light Mode, lines 44–78)
```css
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.637 0.237 25.331);
  --destructive-foreground: oklch(0.637 0.237 25.331);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.871 0.006 286.286);
  --ring: oklch(0.871 0.006 286.286);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(98.5% 0 0);
  --sidebar-foreground: oklch(0.141 0.005 285.823);
  --sidebar-primary: oklch(0.21 0.006 285.885);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.967 0.001 286.375);
  --sidebar-accent-foreground: oklch(0.21 0.006 285.885);
  --sidebar-border: oklch(0.92 0.004 286.32);
  --sidebar-ring: oklch(0.871 0.006 286.286);
}
```

#### After (`:root` — Light Mode)
```css
:root {
  --radius: 0.625rem;
  --background: oklch(0.98 0.005 160);
  --foreground: oklch(0.17 0.04 160);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.17 0.04 160);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.17 0.04 160);
  --primary: oklch(0.38 0.1 160);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.95 0.02 160);
  --secondary-foreground: oklch(0.25 0.06 160);
  --muted: oklch(0.95 0.015 160);
  --muted-foreground: oklch(0.50 0.03 160);
  --accent: oklch(0.92 0.03 160);
  --accent-foreground: oklch(0.25 0.06 160);
  --destructive: oklch(0.637 0.237 25.331);
  --destructive-foreground: oklch(0.637 0.237 25.331);
  --border: oklch(0.90 0.015 160);
  --input: oklch(0.88 0.02 160);
  --ring: oklch(0.55 0.12 160);
  --chart-1: oklch(0.55 0.14 160);
  --chart-2: oklch(0.65 0.12 175);
  --chart-3: oklch(0.45 0.10 145);
  --chart-4: oklch(0.60 0.15 280);
  --chart-5: oklch(0.70 0.12 190);
  --sidebar: oklch(0.97 0.01 160);
  --sidebar-foreground: oklch(0.17 0.04 160);
  --sidebar-primary: oklch(0.38 0.1 160);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.93 0.025 160);
  --sidebar-accent-foreground: oklch(0.25 0.06 160);
  --sidebar-border: oklch(0.90 0.015 160);
  --sidebar-ring: oklch(0.55 0.12 160);
}
```

#### Before (`.dark` — Dark Mode, lines 80–113)
```css
.dark {
  --background: #121212;
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.141 0.005 285.823);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.141 0.005 285.823);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.21 0.006 285.885);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.21 0.006 285.885);
  --muted-foreground: oklch(0.65 0.01 286);
  --accent: oklch(0.21 0.006 285.885);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.496 0.241 25.723);
  --destructive-foreground: oklch(0.737 0.337 25.331);
  --border: oklch(0.274 0.006 286.033);
  --input: oklch(0.274 0.006 286.033);
  --ring: oklch(0.442 0.017 285.786);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: #0f0f0f;
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.274 0.006 286.033);
  --sidebar-ring: oklch(0.442 0.017 285.786);
}
```

#### After (`.dark` — Dark Mode)
```css
.dark {
  --background: oklch(0.15 0.02 160);
  --foreground: oklch(0.95 0.01 160);
  --card: oklch(0.18 0.025 160);
  --card-foreground: oklch(0.95 0.01 160);
  --popover: oklch(0.18 0.025 160);
  --popover-foreground: oklch(0.95 0.01 160);
  --primary: oklch(0.72 0.14 160);
  --primary-foreground: oklch(0.15 0.04 160);
  --secondary: oklch(0.25 0.03 160);
  --secondary-foreground: oklch(0.92 0.01 160);
  --muted: oklch(0.22 0.02 160);
  --muted-foreground: oklch(0.65 0.03 160);
  --accent: oklch(0.25 0.03 160);
  --accent-foreground: oklch(0.92 0.01 160);
  --destructive: oklch(0.496 0.241 25.723);
  --destructive-foreground: oklch(0.737 0.337 25.331);
  --border: oklch(0.28 0.025 160);
  --input: oklch(0.28 0.025 160);
  --ring: oklch(0.55 0.12 160);
  --chart-1: oklch(0.65 0.16 160);
  --chart-2: oklch(0.70 0.14 175);
  --chart-3: oklch(0.60 0.12 145);
  --chart-4: oklch(0.65 0.18 280);
  --chart-5: oklch(0.55 0.14 190);
  --sidebar: oklch(0.13 0.015 160);
  --sidebar-foreground: oklch(0.95 0.01 160);
  --sidebar-primary: oklch(0.65 0.14 160);
  --sidebar-primary-foreground: oklch(0.95 0.01 160);
  --sidebar-accent: oklch(0.22 0.025 160);
  --sidebar-accent-foreground: oklch(0.92 0.01 160);
  --sidebar-border: oklch(0.28 0.025 160);
  --sidebar-ring: oklch(0.55 0.12 160);
}
```

#### Reasoning
- The FixPro website uses a mint-green/teal brand palette (hue ~160° in OKLCH) — the current zinc tokens sit at hue ~286° (blue-gray) with near-zero chroma, producing a completely achromatic design
- **Light mode primary** (`oklch(0.38 0.1 160)`) = dark forest green matching the FixPro CTA buttons — sufficient contrast on white (>4.5:1)
- **Dark mode primary** (`oklch(0.72 0.14 160)`) = bright mint green for visibility on dark backgrounds
- **Background** gets a subtle warm mint tint (`oklch(0.98 0.005 160)`) instead of pure white, matching the FixPro website's light mint background
- **Chart colors** are rebalanced with chart-1 anchored in green (brand), chart-4 in purple/violet (matching the FixPro data viz accent), and chart-2/3/5 as complementary teal/green variants
- **Sidebar** tokens follow the same green shift for cohesive dashboard feel
- **Destructive** colors remain red (hue 25) — intentionally unchanged as red is universal for danger states
- All values use perceptually uniform OKLCH scaling for consistent light/dark transitions

---

### `src/app/layout.tsx`

**Action:** Modify  
**Why:** Root metadata is the first brand touchpoint for search engines and browser tabs  
**Impact:** Title and description change site-wide

#### Before
```tsx
export const metadata: Metadata = {
  title: "Multi-Tenant SaaS Starter",
  description: "A Next.js boilerplate for building web applications",
};
```

#### After
```tsx
export const metadata: Metadata = {
  title: "Fix Pro AI | Free Home Repair Quotes in 5 Minutes",
  description: "Upload your home inspection report and get a detailed, free repair quote from vetted local contractors in under 5 minutes. No more closing delays.",
};
```

#### Reasoning
- Matches the `<title>` and OG description from the production website at vermilion-crayon.cloudvent.net
- Includes primary keyword ("home repair quotes") and brand name for SEO

---

### `src/app/auth/login/login-page-client.tsx`

**Action:** Modify  
**Why:** Login page displays the old brand name as a header element  
**Impact:** Visual brand consistency on the login screen

#### Before
```tsx
          Multi-Tenant SaaS Starter
```

#### After
```tsx
          Fix Pro AI
```

#### Reasoning
- Line 22 renders the brand name as text next to the icon badge
- Only the text content changes; the `GalleryVerticalEnd` icon and layout remain unchanged

---

### `src/app/auth/register/register-page-client.tsx`

**Action:** Modify  
**Why:** Register page displays the old brand name  
**Impact:** Visual brand consistency on the registration screen

#### Before
```tsx
          Multi-Tenant SaaS Starter
```

#### After
```tsx
          Fix Pro AI
```

#### Reasoning
- Same pattern as login page — line 19, text-only change

---

### `src/features/marketing/components/animated-hero.tsx`

**Action:** Modify  
**Why:** Hero section is the primary landing page content — must reflect Fix Pro AI's value proposition  
**Impact:** Complete copy rewrite of the hero section; animated word rotation, headline, subtitle, and CTA buttons

#### Before
```tsx
  const titles = useMemo(
    () => ["secure", "modern", "production-ready", "scalable", "powerful"],
    [],
  );
```

#### After
```tsx
  const titles = useMemo(
    () => ["fast", "free", "accurate", "reliable", "effortless"],
    [],
  );
```

#### Before
```tsx
          <div>
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
          </div>
```

#### After
```tsx
          <div>
            <Button variant="secondary" size="sm" className="gap-4" asChild>
              <a
                href="https://fixpro.ai"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  src="/logo.png"
                  alt="Fix Pro AI"
                  width={16}
                  height={16}
                  className="w-4 h-4"
                />
                Powered by Fix Pro AI <MoveRight className="w-4 h-4" />
              </a>
            </Button>
          </div>
```

#### Before
```tsx
            <h1 className="text-5xl md:text-7xl max-w-2xl tracking-tighter text-center font-regular">
              <span className="text-primary font-medium">
                Authentication made
              </span>
```

#### After
```tsx
            <h1 className="text-5xl md:text-7xl max-w-2xl tracking-tighter text-center font-regular">
              <span className="text-primary font-medium">
                Repair quotes made
              </span>
```

#### Before
```tsx
            <p className="text-lg md:text-xl leading-relaxed tracking-tight text-muted-foreground max-w-2xl text-center">
              Skip months of authentication setup. Get a complete Next.js
              boilerplate with Better Auth, admin dashboard, user management,
              and everything you need to launch your application with
              enterprise-grade security.
            </p>
```

#### After
```tsx
            <p className="text-lg md:text-xl leading-relaxed tracking-tight text-muted-foreground max-w-2xl text-center">
              Upload your home inspection report for a fast and completely free
              repair quote returned in 5 minutes or less, 7 days a week. No
              more closing delays.
            </p>
```

#### Before
```tsx
          <div className="flex flex-row gap-3">
            <Button size="lg" className="gap-4" variant="outline" asChild>
              <a href="/dashboard">View Demo</a>
            </Button>
            <Button size="lg" className="gap-4" asChild>
              <a
                href="https://github.com/good-shepherd-insights/multi-tenant-saas-starter"
                target="_blank"
                rel="noopener noreferrer"
              >
                Check GitHub Repo <MoveRight className="w-4 h-4" />
              </a>
            </Button>
          </div>
```

#### After
```tsx
          <div className="flex flex-row gap-3">
            <Button size="lg" className="gap-4" variant="outline" asChild>
              <a href="/dashboard">Get a Free Quote</a>
            </Button>
            <Button size="lg" className="gap-4" asChild>
              <a href="/dashboard">
                View Licensed Contractors <MoveRight className="w-4 h-4" />
              </a>
            </Button>
          </div>
```

#### Reasoning
- Rotating words now reflect FixPro value props: fast, free, accurate, reliable, effortless
- Headline changes from "Authentication made" to "Repair quotes made" to match core product
- Subtitle drawn directly from website copy (upload report → 5-minute quote)
- CTAs point users to the dashboard (product entry point) rather than an external GitHub repo
- "Built by Good Shepherd Insights" badge becomes "Powered by Fix Pro AI" with link to fixpro.ai
- All structural JSX, animations, and framer-motion logic remain untouched

---

### `src/features/marketing/components/features-grid.tsx`

**Action:** Modify  
**Why:** Feature cards describe a SaaS boilerplate — must describe Fix Pro AI's home repair services instead  
**Impact:** Complete rewrite of the features data array; component rendering logic and layout untouched

#### Before
```tsx
import { Shield, Users, Database, Palette } from "lucide-react";
```

#### After
```tsx
import { Zap, ShieldCheck, CreditCard, Search } from "lucide-react";
```

#### Before
```tsx
  const features = [
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Authentication & Authorization",
      description:
        "Complete auth system with email verification, password reset, and role-based access control.",
      items: [
        "Email & Password Auth",
        "Session Management",
        "Role-based Access",
        "Account Linking",
      ],
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "User Management",
      description:
        "Comprehensive user administration with advanced controls and audit capabilities.",
      items: [
        "User Registration",
        "Profile Management",
        "Ban/Unban Users",
        "Session Revocation",
      ],
    },
    {
      icon: <Database className="h-5 w-5" />,
      title: "Database & ORM",
      description:
        "Modern database setup with type-safe queries and automated migrations.",
      items: [
        "PostgreSQL",
        "Drizzle ORM",
        "Type Safety",
        "Automated Migrations",
      ],
    },
    {
      icon: <Palette className="h-5 w-5" />,
      title: "Modern UI/UX",
      description:
        "Beautiful, responsive design system with accessibility built-in.",
      items: ["Tailwind CSS", "shadcn ui", "Dark Mode", "Mobile Responsive"],
    },
  ];
```

#### After
```tsx
  const features = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Quotes in 5 Minutes",
      description:
        "Upload your inspection report and receive a detailed, free repair quote before you even finish your coffee.",
      items: [
        "Instant Processing",
        "7 Days a Week",
        "No Contractor Calls",
        "Zero Closing Delays",
      ],
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: "Licensed Contractor Team",
      description:
        "Every contractor in our network is vetted, licensed, and insured for every skill and trade pattern.",
      items: [
        "Fully Licensed",
        "Insured & Bonded",
        "Trade-Pattern Verified",
        "Background Checked",
      ],
    },
    {
      icon: <CreditCard className="h-5 w-5" />,
      title: "Flexible Billing Options",
      description:
        "Pay by credit card, check, or even out of escrow. Flexibility isn't a bug — it's a feature.",
      items: [
        "Credit Card",
        "Check Payment",
        "Escrow Billing",
        "Deferred Payment",
      ],
    },
    {
      icon: <Search className="h-5 w-5" />,
      title: "Automated Cost Shopping",
      description:
        "Our platform sources competitive repair quotes from multiple contractors automatically.",
      items: [
        "Multi-Contractor Bids",
        "Best-Price Matching",
        "Material Cost Breakdown",
        "Labor Estimates",
      ],
    },
  ];
```

#### Reasoning
- Icons changed to semantically match the new feature concepts (Zap=speed, ShieldCheck=trust, CreditCard=billing, Search=shopping)
- Copy is derived directly from the website sections at vermilion-crayon.cloudvent.net
- The data array shape and rendering JSX are unchanged — only the content objects differ

---

### `src/features/marketing/components/footer.tsx`

**Action:** Modify  
**Why:** Footer credits Good Shepherd Insights — must credit Fix Pro AI  
**Impact:** Attribution text and link change

#### Before
```tsx
export function Footer() {
  return (
    <div className="text-center mt-12 pt-8 border-t border-border/50">
      <p className="text-sm text-muted-foreground w-full flex align-center">
        Built with ❤️ by{" "}
        <Link
          className="text-primary mx-1"
          href="https://goodshepherdinsights.com"
          target="_blank"
        >
          Good Shepherd Insights
        </Link>
      </p>
    </div>
  );
}
```

#### After
```tsx
export function Footer() {
  return (
    <div className="text-center mt-12 pt-8 border-t border-border/50">
      <p className="text-sm text-muted-foreground w-full flex align-center">
        © {new Date().getFullYear()} Fix Pro AI. All rights reserved.
      </p>
    </div>
  );
}
```

#### Reasoning
- Removes the external link dependency on goodshepherdinsights.com
- Uses dynamic year rendering for maintenance-free copyright
- Matches the footer text from the production website ("© 2026 FixPro AI. All rights reserved.")
- The `Link` import from `next/link` can be removed since it's no longer used

---

### `src/features/marketing/components/navbar.tsx`

**Action:** Modify  
**Why:** Navbar displays the old logo alt text and brand name  
**Impact:** Brand name text and logo alt attribute change

#### Before
```tsx
              <Image
                src="/logo.png"
                alt="Good Shepherd Insights Logo"
                width={24}
                height={24}
                className="w-8 h-8 rounded-md"
              />
              <span className="font-bold text-xl">Multi-Tenant SaaS Starter</span>
```

#### After
```tsx
              <Image
                src="/logo.png"
                alt="Fix Pro AI Logo"
                width={24}
                height={24}
                className="w-8 h-8 rounded-md"
              />
              <span className="font-bold text-xl">Fix Pro AI</span>
```

#### Reasoning
- Two string changes on lines 36 and 41
- No structural changes — same `<Image>` component, same props, same layout

---

### `src/features/marketing/components/tech-stack.tsx`

**Action:** Modify  
**Why:** Tech stack section lists developer tools — should list Fix Pro AI's platform capabilities for end users  
**Impact:** Card title, description, and badge labels change

#### Before
```tsx
export function TechStack() {
  const techStack = [
    "Next.js 15",
    "Better Auth",
    "PostgreSQL",
    "Drizzle ORM",
    "Tailwind CSS",
    "shadcn ui",
    "TypeScript",
    "React Hook Form",
    "Zod",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tech Stack</CardTitle>
        <CardDescription>
          Built with modern technologies for performance, security, and developer
          experience
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {techStack.map((tech, index) => (
            <Badge key={index} variant="outline" className="px-3 py-1">
              {tech}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

#### After
```tsx
export function TechStack() {
  const capabilities = [
    "5-Minute Quotes",
    "Licensed Contractors",
    "Escrow Billing",
    "Automated Pricing",
    "Inspection Reports",
    "Free Estimates",
    "Cost Breakdowns",
    "7-Day Availability",
    "Vetted Network",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Capabilities</CardTitle>
        <CardDescription>
          Everything you need to turn inspection reports into actionable repair
          quotes without the operational friction
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {capabilities.map((item, index) => (
            <Badge key={index} variant="outline" className="px-3 py-1">
              {item}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

#### Reasoning
- Renames `techStack` array and variable to `capabilities` for semantic clarity
- Card title and description rewritten for the Fix Pro AI domain
- Description quote drawn from the website: "Everything you need to turn inspection reports into free quotes without the operational friction"
- Badge items now list platform capabilities instead of developer tools
- No structural/import changes

---

### `src/features/dashboard/registry.ts`

**Action:** Modify  
**Why:** Quick action links point to the old GitHub repo  
**Impact:** "Documentation" link now points to fixpro.ai

#### Before
```tsx
    {
      href: "https://github.com/good-shepherd-insights/multi-tenant-saas-starter",
      label: "Documentation",
      icon: Mail,
      external: true,
    },
```

#### After
```tsx
    {
      href: "https://fixpro.ai",
      label: "Help Center",
      icon: Mail,
      external: true,
    },
```

#### Reasoning
- "Documentation" label makes sense for a dev boilerplate but not a consumer product — "Help Center" is more appropriate
- URL changes from GitHub repo to the Fix Pro AI domain

---

### `src/features/dashboard/config/dashboard-config.ts`

**Action:** Modify  
**Why:** Dashboard page title and quick action link reference the old brand  
**Impact:** Page title and external link change

#### Before
```tsx
  pages: {
    overview: {
      title: "Dashboard | SaaS Starter",
      description: "Your personal dashboard overview.",
    },
  },
```

#### After
```tsx
  pages: {
    overview: {
      title: "Dashboard | Fix Pro AI",
      description: "Your repair quote dashboard overview.",
    },
  },
```

#### Before
```tsx
      {
        href: "https://github.com/good-shepherd-insights/multi-tenant-saas-starter",
        label: "Documentation",
        icon: Mail,
        external: true,
      },
```

#### After
```tsx
      {
        href: "https://fixpro.ai",
        label: "Help Center",
        icon: Mail,
        external: true,
      },
```

#### Reasoning
- Keeps consistency with the registry.ts change
- Page titles now carry the Fix Pro AI brand

---

### `src/app/dashboard/client.tsx`

**Action:** Modify  
**Why:** The sidebar title displays "SaaS Starter" — must show "Fix Pro AI"  
**Impact:** Sidebar header label changes across all dashboard pages

#### Before
```tsx
      title="SaaS Starter"
      version="v1.0.0"
```

#### After
```tsx
      title="Fix Pro AI"
      version="v1.0.0"
```

#### Reasoning
- Line 37 passes the title prop to `DashboardSidebar` which renders it in the sidebar header
- Only the title string changes — version and all other props remain identical

---

### `src/features/dashboard/components/overview/dashboard-overview.tsx`

**Action:** Modify  
**Why:** Dashboard overview contains a hardcoded "Tech Stack" card with developer tool badges identical to the marketing page  
**Impact:** Card title, description, and badge items change to Fix Pro AI platform capabilities

#### Before
```tsx
      {/* Tech Stack (Static for now, could be its own feature) */}
      <Card>
        <CardHeader>
          <CardTitle>Tech Stack</CardTitle>
          <CardDescription>
            Built with modern technologies for performance, security, and
            developer experience
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              "Next.js 15",
              "Better Auth",
              "PostgreSQL",
              "Drizzle ORM",
              "Tailwind CSS",
              "Radix UI",
              "TypeScript",
              "React Hook Form",
              "Zod",
            ].map((tech) => (
              <Badge key={tech} variant="outline" className="px-3 py-1">
                {tech}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
```

#### After
```tsx
      {/* Platform Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Capabilities</CardTitle>
          <CardDescription>
            Everything you need to turn inspection reports into actionable
            repair quotes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              "5-Minute Quotes",
              "Licensed Contractors",
              "Escrow Billing",
              "Automated Pricing",
              "Inspection Reports",
              "Free Estimates",
              "Cost Breakdowns",
              "7-Day Availability",
              "Vetted Network",
            ].map((item) => (
              <Badge key={item} variant="outline" className="px-3 py-1">
                {item}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
```

#### Reasoning
- This is a second instance of the tech stack content (duplicated from `/` marketing page into the `/dashboard` overview)
- Must stay consistent with the marketing `tech-stack.tsx` rebrand
- Variable name in `.map()` changes from `tech` to `item` for semantic clarity

---

### `package.json`

**Action:** Modify  
**Why:** NPM package metadata carries the old identity  
**Impact:** Package name, description, author, homepage, and repository fields change

#### Before
```json
{
  "name": "next-better-auth-starter",
  "version": "2.0.0",
  "description": "A modern Next.js boilerplate with authentication, admin dashboard, and user management built with Better Auth, Drizzle ORM, and PostgreSQL",
  "private": true,
  "author": "Good Shepherd Insights",
  "license": "MIT",
  "homepage": "https://goodshepherdinsights.com",
  "repository": {
    "type": "git",
    "url": "https://github.com/good-shepherd-insights/multi-tenant-saas-starter"
  },
```

#### After
```json
{
  "name": "fixpro-app-dashboard",
  "version": "2.0.0",
  "description": "Fix Pro AI — Upload home inspection reports and get free repair quotes from vetted local contractors in under 5 minutes.",
  "private": true,
  "author": "Fix Pro AI",
  "license": "MIT",
  "homepage": "https://fixpro.ai",
  "repository": {
    "type": "git",
    "url": "https://fixpro.ai"
  },
```

#### Reasoning
- Package name matches the project directory name (`fixpro-app-dashboard`)
- Description matches the website's OG description
- Repository URL can be updated later when a proper repo exists; using the domain as a placeholder

---

### `public/logo.png`

**Action:** Replace asset  
**Why:** Current logo.png is the Good Shepherd Insights logo  
**Impact:** All `<Image src="/logo.png">` references in navbar and hero will display the new logo

#### Approach
- Use the `generate_image` tool to create a Fix Pro AI logo
- Overwrite `public/logo.png`
- No code changes needed — all existing `<Image>` components already reference `/logo.png`

#### Reasoning
- The logo is referenced in exactly 2 components (navbar.tsx line 34, animated-hero.tsx line 38)
- By replacing the asset at the same path, no import or component code needs to change

---

## Validation Plan

### Build Verification
```bash
pnpm build
```
Confirm zero build errors and no broken imports.

### Visual QA (Manual)
```bash
pnpm dev
```
1. Visit `/` — verify mint-green brand palette, navbar shows "Fix Pro AI", hero displays new copy, features grid shows repair services, tech stack shows platform capabilities, footer shows copyright
2. Visit `/auth/login` — verify "Fix Pro AI" brand label, green primary button
3. Visit `/auth/register` — verify "Fix Pro AI" brand label, green primary button
4. Visit `/dashboard` — verify sidebar title says "Fix Pro AI", "Help Center" link points to fixpro.ai, overview badges show platform capabilities
5. Toggle dark mode (if available) — verify green palette carries through, no contrast issues on dark backgrounds
6. Verify logo renders correctly in navbar and hero

### Lint Check
```bash
pnpm lint
```
Confirm no linting regressions.

---

## Risk Notes

| Risk | Mitigation |
|---|---|
| Generated logo may not match exact brand guidelines | Logo can be regenerated or replaced with an official asset later; the code changes are asset-path-agnostic |
| Footer removes the `Link` import but `next/link` may still be used if future edits need it | The import removal is clean — `next/link` is not used elsewhere in footer.tsx |
| OKLCH green values may need fine-tuning once rendered in-browser | Values are derived from the FixPro website's visual palette (hue 160°); can be adjusted post-implementation via CSS-only edits — no component changes needed |
| `package.json` repository URL uses the domain as a placeholder | Will need updating when a dedicated code repository is established |
| Some dashboard components (sidebar, breadcrumb) may display generic text from the registry system | The registry system is data-driven — this plan covers all registry files that contain branded strings |

---

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
