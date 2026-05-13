# FEATURE(estimate-summary-viewer)

## Objective

Add a detail view that displays the AI-generated estimate summary. Clicking an "Analyzed" row in the widget opens it. Demo quality — render summary text with preserved whitespace, no markdown parser.

---

## Phase 1 — Server component for summary page (new file)

**Target:** `src/app/dashboard/estimate/[id]/page.tsx` — new file

Server component. Direct DB query. No client fetching, no action, no useEffect.

```tsx
import { db } from "@/db";
import { estimateRequestTable } from "@/features/estimate/db/schema";
import { eq } from "drizzle-orm";
import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/design-systems/shadcn/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-systems/shadcn/components/card";
import { Badge } from "@/design-systems/shadcn/components/badge";

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await authServerProvider.getSession({ headers: await headers() });
  if (!session?.user) return notFound();

  const [row] = await db.select().from(estimateRequestTable).where(eq(estimateRequestTable.id, id));
  if (!row || row.userId !== session.user.id) return notFound();

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight truncate">{row.fileName}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(row.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700">Analyzed</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          {row.summary ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{row.summary}</pre>
          ) : (
            <p className="text-muted-foreground">No summary available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Phase 2 — Make "Analyzed" widget rows clickable

**Target:** `src/features/estimate/components/recent-estimates-widget.tsx`

Replace the `<div>` wrapping each upload with: `Link` when completed, `div` otherwise. Remove unused `Button` and `ChevronRight` imports.

---

## File Change Summary

| File | Action |
|---|---|
| `src/app/dashboard/estimate/[id]/page.tsx` | **Create** |
| `src/features/estimate/components/recent-estimates-widget.tsx` | Modify |