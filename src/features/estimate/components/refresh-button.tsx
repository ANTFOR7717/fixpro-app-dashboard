"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/design-systems/shadcn/components/button";
import { cn } from "@/lib/utils";

/**
 * A small button that calls `router.refresh()` to re-fetch the current RSC
 * tree (and its server-rendered children, including the estimates list).
 *
 * While the refresh is in flight we spin the icon briefly so the click
 * feels acknowledged even though the actual re-render is sub-second.
 */
export function RefreshButton({
  className,
  label = "Refresh",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [spinning, setSpinning] = React.useState(false);

  const onClick = React.useCallback(() => {
    setSpinning(true);
    // Trigger the RSC re-fetch first; clear the spin state on the next
    // tick so the icon is visibly animating during the navigation.
    router.refresh();
    const t = window.setTimeout(() => setSpinning(false), 600);
    return () => window.clearTimeout(t);
  }, [router]);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(className)}
    >
      <RefreshCw
        className={cn(
          "h-4 w-4 transition-transform",
          spinning && "animate-spin",
        )}
      />
    </Button>
  );
}
