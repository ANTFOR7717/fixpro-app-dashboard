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
