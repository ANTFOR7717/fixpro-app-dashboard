import type { ReactNode, JSX } from "react";

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
