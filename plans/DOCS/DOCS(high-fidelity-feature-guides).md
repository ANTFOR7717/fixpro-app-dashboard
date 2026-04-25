# DOCS(high-fidelity-feature-guides)

## Request
Create two exhaustive, high-fidelity guides: `CREATE_FEATURE_COMPONENT.MD` (for widget-only features) and `CREATE_FEATURE_PAGE.MD` (for page-centric features). Guides must explain internal mechanisms, metadata schemas, and registration sequences with zero emojis.

## Directory Map
```text
CREATE_FEATURE_COMPONENT.MD       (new)
CREATE_FEATURE_PAGE.MD            (new)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| CREATE_FEATURE_COMPONENT.MD | create | Establish a technical manual for partial feature implementation focusing on the dashboard widget registry. |
| CREATE_FEATURE_PAGE.MD | create | Establish a technical manual for full-page feature implementation focusing on dynamic routing and navigation manifests. |

## Existing Pattern Audit
- **Metadata**: `FeatureMetadata` interface in `src/lib/registry.tsx`.
- **Registration**: `src/config/features-index.ts` activator.
- **Routing**: `/dashboard/[feature]/page.tsx` for standalone views.
- **Dashboard**: `app/dashboard/page.tsx` for widget reconciliation.

## Execution Plan
### Step 1 — Draft `CREATE_FEATURE_COMPONENT.MD`
Focus on:
- "Partial Features" philosophy.
- The `widgets` array and `FeatureWidget` schema.
- The Dashboard Bento Grid (sm/md/lg/full) mapping.
- State management and server-side fetching within widgets.

### Step 2 — Draft `CREATE_FEATURE_PAGE.MD`
Focus on:
- "Full-Page Features" philosophy.
- The `navigation` manifest (Sidebar vs Navbar).
- The `page` property as a ReactNode.
- Dynamic route resolution through the `[feature]` segment.
- RBAC (`adminOnly`) integration.

### Step 3 — Final Audit
Ensure technical terms (Reconciliation, Manifest, Activation, Discovery) are used correctly and no emojis are present.

## File-by-File Details

### `CREATE_FEATURE_COMPONENT.MD`
**Sections**:
1. **Introduction to Partial Features**.
2. **Directory Anatomy** (`src/features/[name]/`).
3. **The Widget Manifest** (Detailed schema breakdown).
4. **Grid Scaling Strategy** (Explaining sm/md/lg/full).
5. **Implementation Example** (Code block for registry.ts).
6. **Activation Sequence**.

### `CREATE_FEATURE_PAGE.MD`
**Sections**:
1. **Introduction to Domain Pages**.
2. **Directory Anatomy** (Structure + `page.tsx` logic).
3. **The Navigation Manifest** (Detailed link schema).
4. **Dynamic Route Resolution** (How the system mounts the `page` prop).
5. **RBAC and Security** (adminOnly).
6. **Implementation Example**.

## Validation Plan
- Cross-reference all exported interfaces from `src/lib/registry.tsx`.
- Ensure paths in examples are absolute and accurate.
- Zero-emoji audit.

## Approval
Status: Awaiting explicit user approval. Do not implement yet.
