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
