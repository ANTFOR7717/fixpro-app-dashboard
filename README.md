# Multi-Tenant SaaS Starter

A modern, production-ready Next.js boilerplate designed for high-fidelity SaaS applications. This starter implements a modular feature-slice architecture, a hexagonal authentication layer, and a configuration-driven UI system. Maintained and specialized by [Good Shepherd Insights, LLC.](https://goodshepherdinsights.com) for rapid application development.

---

## Architecture and Developer Guide

This application follows a configuration-driven, modular architecture. For a deep-dive into the technical specifications, class relationships, and database ER diagrams, refer to the [Full Architectural Specification](file:///Users/dev/Projects/multi-tenant-saas-starter/ARCHITECTURE.md).

### Modular Registry System

The UI and business logic are decoupled via a central discovery registry. This allows features to be toggled or swapped without modifying the root layout or navigation components.

```mermaid
graph TD
    subgraph "Core Registry"
        Registry["FeatureRegistry (Singleton)"]
        Activator["src/config/features-index.ts"]
    end

    subgraph "Feature Slices"
        F_Dash["Dashboard Feature"]
        F_Auth["Auth Feature"]
        F_Custom["New Feature"]
    end

    F_Dash -- "Metadata" --> Activator
    F_Auth -- "Metadata" --> Activator
    F_Custom -- "Metadata" --> Activator
    
    Activator -- "register()" --> Registry
    
    Layout["app/layout.tsx"] -- "Discovery" --> Registry
    Nav["Sidebar/Navbar"] -- "Query" --> Registry
```

### Extending the Platform

To add a new feature to the system, follow the standardized "Plug-and-Play" workflow:

1. **Create Slice**: Build your domain logic in `src/features/[feature-name]/`.
2. **Define Metadata**: Create a `registry.ts` in your slice that implements the `FeatureMetadata` interface.
3. **Activate**: Import and add your feature to the list in `src/config/features-index.ts`.

Detailed implementation rules are covered in [ARCHITECTURE.md Section 4: Feature Plugin System](file:///Users/dev/Projects/multi-tenant-saas-starter/ARCHITECTURE.md#4-feature-plugin-system).

### Hexagonal Authentication Layer

Identity management is isolated behind a Port/Adapter boundary (`src/auth/`). This prevents the application core from being "locked in" to the Better Auth implementation.

- **Port**: `src/auth/types.ts` defines the interface.
- **Adapter**: `src/auth/adapters/better-auth/` handles the implementation.
- **Injection**: `src/auth/server-provider.ts` and `client-provider.ts` expose the session logic to the app.

For visual mapping of these boundaries, see [ARCHITECTURE.md Section 3: Authentication Layer](file:///Users/dev/Projects/multi-tenant-saas-starter/ARCHITECTURE.md#3-authentication-layer-hexagonal).

## Project Structure

The codebase is organized to ensure features are self-contained and easily pluggable.

```text
src/
├── app/                    # Next.js App Router (Routing Shell)
├── auth/                   # Hexagonal Auth Layer (Ports/Adapters/DI)
├── config/                 # Platform-level feature activation index
├── db/                     # Data persistence (Schema & Drizzle config)
├── design-systems/         # Unified UI primitives (shadcn, Radix, Tailwind v4)
├── features/               # Modular domain slices
│   ├── auth/               # Identity and Credential management
│   ├── dashboard/          # Performance overview and layout logic
│   ├── marketing/          # Public-facing landing and presentation
│   ├── new-dashboard/      # Analytical dashboard implementation
│   └── user-management/    # Administrative controls and RBAC actions
├── hooks/                  # Global React hooks
├── lib/                    # Core Registry and shared utility logic
└── proxy.ts                # Middleware authentication shim
```

---

## Core Features

The starter provides a comprehensive feature set for building multi-tenant SaaS applications with strict domain separation.

### Identity and Access
- **Multi-Provider Auth**: Native support for Email/Password, GitHub, and Google OAuth.
- **Account Linking**: Automatic linking of multiple social identities to a single user profile.
- **Email Verification**: Mandatory verification flow via Resend integration.
- **Role-Based Access Control**: Domain-level RBAC (admin/user) with session-guarded layouts.
- **Security Headers**: Production-ready CSRF and Trusted Origin protection.

### Management and Dashboards
- **Modular Dashboard**: Configurable widget-based dashboard overview.
- **User Management**: Administrative interface for viewing, banning, and managing user roles.
- **Registry System**: Plugin-driven architecture for enabling/disabling feature slices.

### Design and UX
- **Theme System**: OKLCH-based design tokens for perfectly consistent color scaling.
- **Typography**: Optimized Geist-compliant font stack (Zinc/Stone palette).
- **Responsive Primitives**: Pure Radix UI components with CVA variant logic.

---

## Configuration

### Environment Variables

Required secrets and configuration keys defined in `.env.local`.

| Variable | Required | Description |
|---|---|---|
| BETTER_AUTH_SECRET | Yes | High-entropy 32-character string used for cryptographic signing and encryption of session cookies. Generate via `openssl rand -hex 32`. Rotating this key will immediately invalidate all active user sessions. |
| BETTER_AUTH_URL | Yes | The canonical base URL of the application. In production, this must explicitly include the `https://` protocol and match the public domain. Do not include a trailing slash. |
| DATABASE_URL | Yes | Full PostgreSQL connection URI. Format: `postgresql://user:password@host:port/dbname?sslmode=require`. Use `sslmode=require` to ensure encrypted transport for remote/managed production databases. |
| GITHUB_CLIENT_ID | No | The Client ID for the GitHub OAuth application. Registered under Developer Settings > OAuth Apps. |
| GITHUB_CLIENT_SECRET | No | The Client Secret for the GitHub OAuth application. Required for the `access_token` exchange flow. |
| GOOGLE_CLIENT_ID | No | The Client ID for the Google OAuth 2.0 application. Managed via the Google Cloud Console (APIs & Services). |
| GOOGLE_CLIENT_SECRET | No | The Client Secret for the Google OAuth application. The redirect URI must be authorized as `${BETTER_AUTH_URL}/api/auth/callback/google`. |
| RESEND_API_KEY | No | API Key for transactional email delivery via Resend. Mandatory if `requireEmailVerification` is enabled in the auth configuration. |

---

## Operational Guide

### Database Management (Drizzle Kit)

The project uses Drizzle ORM for type-safe schema management and migrations.

- **Generate Migrations**: `pnpm db:generate` to introspect `src/db/schema.ts` and create SQL files.
- **Apply Migrations**: `pnpm db:migrate` to push changes to the PostgreSQL instance.
- **Data Viewer**: `pnpm db:studio` to launch the local Drizzle Studio GUI.

### Administrative Setup

To grant administrative access to a user account, use the Drizzle Studio interface or a SQL update:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'your-email@example.com';
```

Once updated, the user will be granted access to the `/admin` workspace and management tools.

---

## Core Technologies

The stack is curated for maximum type safety, performance, and developer ergonomics.

- **Framework**: Next.js 16 (App Router)
- **Authentication**: Better Auth (Hexagonal Implementation)
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS v4 (Pure CSS Engine with OKLCH tokens)
- **UI Components**: Radix UI with shadcn/ui primitives
- **Registry**: Custom FeatureRegistry for dynamic discoverability
- **Validation**: Zod (End-to-end schema integrity)
- **Deployment**: Vercel ready

---

## Key Architectural Patterns

### 1. Hexagonal Identity Architecture (DIP)
The identity management layer implements a strict **Dependency Inversion Principle**. By isolating the authentication SDK behind the `IAuthServerAdapter` and `IAuthClientAdapter` port interfaces (`src/auth/`), the application core remains decoupled from the specific implementation details of the underlying identity provider. This architecture allows for seamless provider swaps, sophisticated unit testing via mock adapters, and multi-environment flexibility—ensuring that the business logic never leaks into the authentication implementation.

### 2. Configuration-Driven Registry Discovery
The platform utilizes a **Singleton-based Feature Registry** model. Feature slices (`src/features/`) are self-describing modules that register their metadata—including navigation, widgets, and RBAC rules—with a central discovery engine at boot time. This facilitates **Plug-and-Play modularity**, where features can be enabled, disabled, or strictly gated by the multi-tenant engine simply by modifying the `src/config/features-index.ts` activator, requiring zero manual updates to the shared layout or navigation primitives.

### 3. Feature-Sliced Design (FSD)
The codebase follows a modular slicing strategy where domain-specific logic, components, and state are colocated within their respective feature directories. This prevents the emergence of "God Components" and ensures that the system scales linearly. Cross-feature dependencies are strictly managed via the public `registry.ts` interface, maintaining a clean directed acyclic graph (DAG) across the application architecture.

---

## Quick Start

### Prerequisites

- Node.js 18 or higher
- PostgreSQL instance (Local or Supabase)
- Resend API key (for email verification)

### Installation

1. Clone the repository: `git clone https://github.com/good-shepherd-insights/multi-tenant-saas-starter`
2. Install dependencies: `pnpm install`
3. Configure environment: `cp .env.example .env.local`
4. Populate database: `pnpm db:generate` then `pnpm db:migrate`
5. Launch: `pnpm dev`

### Available Commands

- `pnpm dev`: Start development server with Turbopack (Rapid compilation)
- `pnpm build`: Compile for production
- `pnpm start`: Launch production server
- `pnpm db:studio`: Open Drizzle local data viewer
- `pnpm lint`: Run ESLint checks

---

---

Maintained by [Good Shepherd Insights](https://goodshepherdinsights.com).
Originally created by [Zexa](https://github.com/zexahq) - [better-auth-starter](https://github.com/zexahq/better-auth-starter)