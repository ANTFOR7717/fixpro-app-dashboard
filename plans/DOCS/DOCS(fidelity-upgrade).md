# DOCS(fidelity-upgrade)

## Request
Identify and rectify "lazy" or sparse technical descriptions throughout the architectural documentation (`ARCHITECTURE.md`) and project entry points (`README.md`). Ensure documentation reflects production-grade engineering standards with deep technical context. No emojis allowed.

## Directory Map
```text
README.md                         (modify)
ARCHITECTURE.md                   (modify)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| README.md | modify | Upgrade the "Key Patterns" and "Project Structure" descriptions to be technically exhaustive, focusing on the "How" and "Why" (DIP, Singletons, Modular Slicing). |
| ARCHITECTURE.md | modify | Expand textual descriptions between diagrams to explain internal mechanisms (Bootstrapping lifecycle, Adapter Factory pattern, Registry reconciliation). |

## Existing Pattern Audit
- **Auth**: Port/Adapter. Currently described as "Isolated via pattern". Needs: "Dependency Inversion via abstract interfaces to achieve framework-agnostic identity management."
- **Registry**: "Self-registration model". Needs: "Registry-based module discovery enabling multi-tenant feature toggling and lazy component resolution."
- **Data Flow**: Needs more detail on the `Proxy` shim in `src/proxy.ts` and its role in the request lifecycle.

## Execution Plan
### Step 1 — Upgrade README Pattern Descriptions
Rewrite the "Key Patterns" section to use precise architectural terminology (Inversion of Control, Feature-Sliced Design nuances, etc.).

### Step 2 — Upgrade ARCHITECTURE.md Core Logic
- **Section 1.2**: Detail the Middleware -> Layout -> Registry bootstrap sequence.
- **Section 3**: Elaborate on the `src/auth/types.ts` contract and the factory pattern used in `server-provider.ts`.
- **Section 4.1**: Explain the `FeatureMetadata` interface in the context of "Platform Agnosticism".
- **Section 10**: Expand the "Role" column for dependencies to explain *specific* usage (e.g., "OKLCH color scaling engine").

### Step 3 — Audit Operational Guides
Refine the `db:migrate` and `db:push` distinctions and explain the `verified` email requirement for OAuth linking.

## File-by-File Changes

### `README.md`
**Action:** Modify  
**Why:** Descriptions are currently "sparse" and don't communicate the sophisticated architectural decisions made (DIP, Registry singleton).  
**Impact:** Projects a higher standard of engineering and provides better onboarding.

#### Before
```md
### 1. Hexagonal Identity Architecture
The authentication layer is isolated via the Port/Adapter pattern in `src/auth/`. The application core depends only on the `IAuthServerAdapter` and `IAuthClientAdapter` interfaces, ensuring that the identity provider (Better Auth) can be swapped without modifying business logic.
```

#### After
```md
### 1. Hexagonal Identity Architecture (DIP)
The identity management layer implements a strict **Dependency Inversion Principle**. By isolating the authentication SDK behind the `IAuthServerAdapter` and `IAuthClientAdapter` port interfaces (`src/auth/`), the application core remains decoupled from the specific implementation details of Better Auth. This allows for seamless provider swaps, sophisticated unit testing via mock adapters, and multi-environment flexibility without touching the presentation or business logic layers.

### 2. Configuration-Driven Registry Discovery
The platform utilizes a **Singleton-based Feature Registry** model. Feature slices (`src/features/`) are self-describing modules that register their metadata (navigation, widgets, RBAC rules) with a central discovery engine at boot time. This facilitates **Plug-and-Play modularity**, where features can be enabled, disabled, or strictly gated by the multi-tenant engine simply by modifying the `src/config/features-index.ts` activator, requiring zero manual updates to the shared layout or sidebar components.
```

### `ARCHITECTURE.md`
**Action:** Modify  
**Why:** Textual descriptions are secondary to diagrams and lack the "meat" required for a production manual.  
**Impact:** Provides the technical "Why" behind the "How" shown in Mermaid diagrams.

#### Sections to Upgrade
- **Section 3**: Explain that `server-provider.ts` uses a **Factory Pattern** to instantiate adapters with the database instance already injected.
- **Section 4**: Describe how the Registry handles **Reconciliation** between static metadata and dynamic session state (e.g. hiding admin-only nav items).

## Validation Plan
- Verify all technical terms (IoC, DIP, Factory, Singleton) are used correctly.
- Ensure zero-emoji compliance.
- Audit for "lazy" phrases like "system handles it" or "automatically works".

## Approval
Status: Awaiting explicit user approval. Do not implement yet.
