import type { LucideIcon } from "lucide-react";
import type { IconName } from "lucide-react/dynamic";
import type { ReactNode } from "react";

export interface FeatureWidget {
  id: string;
  title: string;
  description?: string;
  component: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
}

// `icon` is a string (lucide IconName) so navigation items remain serializable
// across the Next.js server→client component boundary. The sidebar resolves
// the actual component via lucide-react's `DynamicIcon`.
export interface FeatureNavigation {
  href: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
  position?: "sidebar" | "navbar" | "footer";
}

export interface FeatureMetadata {
  id: string;
  name: string;
  navigation?: FeatureNavigation[];
  widgets?: FeatureWidget[];
  publicPaths?: string[]; 
  page?: ReactNode; // <-- New: Features can define a full-page view
  quickActions?: {
    href: string;
    label: string;
    icon: LucideIcon;
    external?: boolean;
  }[];
}

class Registry {
  private features: Map<string, FeatureMetadata> = new Map();

  register(metadata: FeatureMetadata) {
    if (this.features.has(metadata.id)) {
      console.warn(`Feature ${metadata.id} is already registered. Overwriting.`);
    }
    this.features.set(metadata.id, metadata);
  }

  getFeature(id: string) {
    return this.features.get(id);
  }

  getPublicPaths() {
    return Array.from(this.features.values()).flatMap((f) => f.publicPaths || []);
  }

  getNavigation(
    role: "admin" | "user" = "user",
    position: "sidebar" | "navbar" | "footer" = "sidebar"
  ) {
    return Array.from(this.features.values())
      .flatMap((f) => f.navigation || [])
      .filter((n) => (n.position || "sidebar") === position)
      .filter((n) => !n.adminOnly || role === "admin");
  }

  getWidgets() {
    return Array.from(this.features.values()).flatMap((f) => f.widgets || []);
  }

  getQuickActions() {
    return Array.from(this.features.values()).flatMap((f) => f.quickActions || []);
  }
}

// Singleton for app-wide state
export const featureRegistry = new Registry();
