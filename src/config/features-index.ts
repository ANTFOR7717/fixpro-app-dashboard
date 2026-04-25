import { featureRegistry } from "@/lib/registry";
import { authMetadata } from "@/features/auth/registry";
import { userManagementMetadata } from "@/features/user-management/registry";
import { dashboardMetadata } from "@/features/dashboard/registry";
import { newDashboardMetadata } from "@/features/new-dashboard/registry";
import { estimateMetadata } from "@/features/estimate/registry";

// Core Features
featureRegistry.register(dashboardMetadata);
featureRegistry.register(authMetadata);
featureRegistry.register(userManagementMetadata);

// New Feature Integration
featureRegistry.register(newDashboardMetadata);
featureRegistry.register(estimateMetadata);

export { featureRegistry };
