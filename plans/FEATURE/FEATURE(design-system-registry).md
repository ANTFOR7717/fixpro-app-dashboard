# FEATURE(design-system-registry)

## Request

Introduce a scoped design system registry (`src/design-systems/`) that allows Radix Themes to coexist alongside the existing shadcn/ui (Tailwind + Radix Primitives) setup without any CSS token conflicts or global pollution. The registry follows the hexagonal architecture pattern already established by `src/auth/` — a root-level infrastructure layer with adapters, a provider, and an interface contract — so any design system (shadcn, Radix Themes, or future additions) can be adopted or swapped per-feature-slice without touching shared code.

The plan covers:
1. Installing `@radix-ui/themes` as a new dependency.
2. Creating `src/design-systems/` with a provider pattern that mirrors the `src/auth/` adapter model.

---

## Directory Map

```text
src/
  design-systems/                                      (new dir)
    types.ts                                           (new)
    radix/                                             (new dir)
      provider.tsx                                     (new)
      styles.css                                       (new)
      tokens.ts                                        (new)
    shadcn/                                            (new dir)
      provider.tsx                                     (new)
package.json                                           (modify)
```

---

## Modification Table

| File | Action | Why |
|---|---|---|
| `package.json` | Modify | Add `@radix-ui/themes` runtime dependency. Currently absent from `dependencies`. |
| `src/design-systems/types.ts` | Create | Port interface for design system adapter contract. Mirrors `src/auth/types.ts` in purpose. |
| `src/design-systems/radix/styles.css` | Create | CSS containment wall. Imports Radix Themes stylesheet. Never imported globally. |
| `src/design-systems/radix/tokens.ts` | Create | Centralized Radix Themes configuration object. Consumed only by `radix/provider.tsx`. |
| `src/design-systems/radix/provider.tsx` | Create | Concrete Radix Themes adapter implementing `IDesignSystemProvider`. Only file in the project that imports `@radix-ui/themes`. |
| `src/design-systems/shadcn/provider.tsx` | Create | shadcn passthrough adapter. Documents zero provider requirement. Satisfies `IDesignSystemProvider`. |

---

## Existing Pattern Audit

### Architecture Pattern: `src/auth/` as Infrastructure Registry

The project has already established that cross-cutting technical concerns live at the `src/` root as framework-agnostic infrastructure with a port interface, adapters, and a provider file:

```text
src/auth/
  types.ts              ← port interface (IAuthClientAdapter, IAuthServerAdapter)
  client-provider.ts    ← DI singleton binding the concrete adapter
  server-provider.ts    ← DI singleton for server contexts
  adapters/
    better-auth/
      client.ts         ← concrete class implementing IAuthClientAdapter
      server.ts         ← concrete class implementing IAuthServerAdapter
```

`src/design-systems/` directly mirrors this structure:

```text
src/design-systems/
  types.ts              ← port interface (IDesignSystemProvider)
  radix/
    provider.tsx        ← concrete Radix Themes adapter (client component)
    styles.css          ← CSS import boundary
    tokens.ts           ← config extraction
  shadcn/
    provider.tsx        ← passthrough adapter (documents zero provider dependency)
```

### CSS Token Namespace

`globals.css` defines shadcn tokens using these custom property names:
- `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--sidebar-*`, `--chart-*`

The `@theme inline` block in `globals.css` also maps `--color-background: var(--background)`.

Radix Themes defines its own tokens including `--color-background`, `--color-surface`, `--accent-1` through `--accent-12`, and `--gray-1` through `--gray-12`. If Radix Themes CSS is imported globally (via `:root`), its `--color-background` value would overwrite the shadcn mapping. This is the primary conflict risk and the reason Radix CSS must only reach the DOM inside the scoped `<Theme>` provider.

### Feature Slice Boundaries

All presentational and business logic lives inside `src/features/<slice>/`. The marketing slice at `src/features/marketing/` is the demonstration site for this change because all four of its component files are purely visual and have no shared server or auth dependencies that would be disrupted.

### Next.js App Router Scoping

`src/features/marketing/` is a feature domain folder, not a Next.js App Router route segment. Route segment `layout.tsx` files must live inside `src/app/`. Since the marketing components are rendered from `src/app/page.tsx` (the root page), the correct scoping mechanism is a wrapper component (`MarketingShell`) that the root page imports — not a filesystem-level layout file. This avoids misusing App Router conventions.

---

## Execution Plan

### Step 1 — Install `@radix-ui/themes`
**Files:** `package.json`  
Add the dependency entry. Run `pnpm install` to resolve into the lockfile.

### Step 2 — Define the Design System Interface
**Files:** `src/design-systems/types.ts`  
Create the `IDesignSystemProvider` interface. Every adapter (radix, shadcn) satisfies this at compile time.

### Step 3 — Create the Radix Themes Adapter
**Files:** `src/design-systems/radix/tokens.ts`, `src/design-systems/radix/styles.css`, `src/design-systems/radix/provider.tsx`  
Build the CSS containment boundary, extract the token config, and create the `<Theme>` wrapper component.

### Step 4 — Create the shadcn Passthrough Adapter
**Files:** `src/design-systems/shadcn/provider.tsx`  
Register shadcn in the registry as a zero-runtime-cost passthrough.

---

## File-by-File Changes

### `package.json`

**Action:** Modify  
**Why:** `@radix-ui/themes` is absent from `dependencies`. Without this entry and a subsequent install, all imports in `src/design-systems/radix/` will fail at build time.  
**Impact:** One new runtime dependency. Existing `@radix-ui/react-*` primitive packages remain untouched.

#### Before
```json
  "dependencies": {
    "@better-auth/infra": "0.1.13",
    "@hookform/resolvers": "^5.0.1",
    "@radix-ui/react-alert-dialog": "^1.1.14",
```

#### After
```json
  "dependencies": {
    "@better-auth/infra": "0.1.13",
    "@hookform/resolvers": "^5.0.1",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/themes": "^3.2.1",
```

#### Reasoning
- `@radix-ui/themes` v3.x officially supports React 18 and 19. The project uses `"react": "^19.2.3"`.
- It does not replace or conflict with the existing `@radix-ui/react-*` primitives used by shadcn components.
- `pnpm install` must be run after this edit to update `pnpm-lock.yaml`.

---

### `src/design-systems/types.ts`

**Action:** Create  
**Why:** Establishes the `IDesignSystemProvider` interface — the single contract every design system adapter must satisfy. Mirrors the role of `src/auth/types.ts`.  
**Impact:** Pure type definition. Zero runtime cost.

#### Before
File does not exist yet.

#### After
```ts
import type { ReactNode } from "react";

/**
 * Every design system registered in src/design-systems/ must export a
 * Provider component that satisfies this interface.
 *
 * The Provider wraps a subtree of the component tree in the design system's
 * required context and styling. Feature slices import their chosen provider
 * and apply it at their scope boundary via a shell component.
 */
export interface IDesignSystemProvider {
  Provider: (props: { children: ReactNode }) => JSX.Element;
}
```

#### Reasoning
- The `Provider` shape accepts `{ children: ReactNode }` — compatible with both Radix's `<Theme>` and a React Fragment passthrough.
- This interface prevents future adapters from diverging in shape.
- No Radix Themes or Tailwind API surface is leaked into this file.

---

### `src/design-systems/radix/styles.css`

**Action:** Create  
**Why:** Contains the single CSS import of `@radix-ui/themes/styles.css`. This file is the explicit containment wall — imported only from `radix/provider.tsx`, never from `globals.css` or any shared stylesheet.  
**Impact:** Radix Themes CSS custom properties only reach the DOM when this file's importing component renders. Pages that never render the Radix provider receive zero Radix CSS.

#### Before
File does not exist yet.

#### After
```css
/* Radix Themes stylesheet — imported exclusively by src/design-systems/radix/provider.tsx.
   Never import this file from globals.css or any shared layout.
   This boundary prevents Radix's --color-background and scale tokens from
   overwriting the shadcn token system defined in globals.css. */
@import "@radix-ui/themes/styles.css";
```

#### Reasoning
- The comment is mandatory contributor documentation stating the containment rule.
- `@import "@radix-ui/themes/styles.css"` is the vendor-recommended import for Radix Themes v3.
- Turbopack (used via `"dev": "next dev --turbopack"`) associates CSS imports with the component file that imports them. CSS from a `"use client"` component is only bundled for routes that render that component.

---

### `src/design-systems/radix/tokens.ts`

**Action:** Create  
**Why:** Extracts the Radix Themes configuration into a dedicated constant so visual settings are changed in one place without touching the provider's JSX.  
**Impact:** Zero runtime cost beyond the config object. Consumed only by `radix/provider.tsx`.

#### Before
File does not exist yet.

#### After
```ts
import type { ThemeProps } from "@radix-ui/themes";

/**
 * Radix Themes design token configuration.
 * Applied at the <Theme> wrapper level in radix/provider.tsx.
 * All Radix components rendered inside the provider inherit these tokens.
 */
export const radixTokens: Pick<
  ThemeProps,
  "accentColor" | "grayColor" | "radius" | "scaling" | "appearance"
> = {
  accentColor: "violet",
  grayColor: "slate",
  radius: "medium",
  scaling: "100%",
  appearance: "inherit",
};
```

#### Reasoning
- `appearance: "inherit"` is a valid member of the `ThemeProps["appearance"]` union (`"inherit" | "light" | "dark"`). The `Pick<ThemeProps, "appearance">` constraint enforces this at compile time — if the value were wrong, TypeScript would surface a type error immediately.
- `appearance: "inherit"` tells Radix Themes to follow the document's current color scheme rather than forcing its own. This prevents Radix from overriding the dark mode managed by the `.dark` class system already defined in `globals.css`.
- `accentColor: "violet"` is a placeholder. It can be changed without touching the provider JSX.
- `Pick<ThemeProps, ...>` derives the type directly from the installed `@radix-ui/themes` package rather than declaring it manually.

---

### `src/design-systems/radix/provider.tsx`

**Action:** Create  
**Why:** The concrete Radix Themes adapter. The only file in the codebase that imports from `@radix-ui/themes` or renders the `<Theme>` wrapper.  
**Impact:** Exports `RadixProvider` and `radixProvider` (the DI singleton satisfying `IDesignSystemProvider`). Feature slices import `RadixProvider` into their shell components.

#### Before
File does not exist yet.

#### After
```tsx
"use client";

import "./styles.css";
import { Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { radixTokens } from "./tokens";
import type { IDesignSystemProvider } from "../types";

/**
 * Radix Themes provider adapter.
 *
 * Must only wrap feature-level scope boundaries (via shell components).
 * Never hoist this to src/app/layout.tsx.
 *
 * The styles.css import is the containment boundary —
 * Radix CSS tokens only reach the DOM when this component renders.
 */
function Provider({ children }: { children: ReactNode }) {
  return (
    <Theme
      accentColor={radixTokens.accentColor}
      grayColor={radixTokens.grayColor}
      radius={radixTokens.radius}
      scaling={radixTokens.scaling}
      appearance={radixTokens.appearance}
    >
      {children}
    </Theme>
  );
}

// Satisfies IDesignSystemProvider at compile time
export const radixProvider: IDesignSystemProvider = { Provider };

export { Provider as RadixProvider };
```

#### Reasoning
- `"use client"` is required because Radix's `<Theme>` uses React context internally, which is client-side only.
- `import "./styles.css"` on line 3 is the containment wall. Turbopack scopes this CSS to routes that actually render this component.
- `export const radixProvider: IDesignSystemProvider` enforces the interface contract at compile time. If `Provider`'s signature drifts, the assignment fails.
- `export { Provider as RadixProvider }` is the named export used by shell components.

---

### `src/design-systems/shadcn/provider.tsx`

**Action:** Create  
**Why:** Formally registers shadcn as a design system in the registry. Documents that it has no runtime provider.  
**Impact:** Zero runtime cost. Pure documentation and interface compliance.

#### Before
File does not exist yet.

#### After
```tsx
import type { ReactNode } from "react";
import type { IDesignSystemProvider } from "../types";

/**
 * shadcn/ui design system provider adapter.
 *
 * shadcn/ui has no runtime provider requirement — its styling is delivered
 * entirely through Tailwind CSS classes injected globally via src/app/globals.css.
 *
 * This file formally registers shadcn as a design system in the registry.
 * Feature slices using shadcn components do not need to wrap in any provider.
 */
function Provider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// Satisfies IDesignSystemProvider at compile time
export const shadcnProvider: IDesignSystemProvider = { Provider };

export { Provider as ShadcnProvider };
```

#### Reasoning
- `<>{children}</>` is a React Fragment passthrough. Zero overhead.
- `export const shadcnProvider: IDesignSystemProvider` enforces interface compliance identically to the Radix adapter, making the registry symmetric.
- The JSDoc explicitly states that this file's purpose is registry documentation, not runtime behavior.

---

## Validation Plan

```bash
# 1. Install the new dependency
pnpm install

# 2. TypeScript compile check — verifies IDesignSystemProvider interface compliance
# and that @radix-ui/themes ThemeProps resolves correctly
pnpm exec tsc --noEmit

# 3. Dev server — confirms Turbopack resolves @radix-ui/themes and the CSS import
pnpm dev

# 4. Production build — confirms no bundling errors or CSS conflicts
pnpm build
```

**Manual QA:**
- Confirm `src/design-systems/` directory exists with all 6 new files.
- Confirm `@radix-ui/themes` appears in `node_modules` after `pnpm install`.
- Confirm `pnpm exec tsc --noEmit` exits with zero errors — verifies `IDesignSystemProvider` is satisfied by both adapters and `Pick<ThemeProps, ...>` resolves correctly.
- Confirm `pnpm build` exits cleanly with no CSS or module resolution errors.

---

## Risk Notes

| Risk | Severity | Mitigation |
|---|---|---|
| Radix Themes CSS bleeds globally if misimported | High | `styles.css` may only be imported from `radix/provider.tsx`. The JSDoc comment on that file documents this rule explicitly. |
| `--color-background` token collision if `<Theme>` is ever hoisted globally | High | `appearance: "inherit"` prevents Radix from forcing its own `:root` background value. The provider must only be used inside feature-level shell components, never in `src/app/layout.tsx`. |
| React 19 + `@radix-ui/themes` v3 compatibility | Low | Radix Themes v3.2+ officially supports React 19. Verified against `"react": "^19.2.3"` in `package.json`. |

---

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`


