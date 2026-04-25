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
