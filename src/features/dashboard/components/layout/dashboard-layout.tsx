"use client";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/design-systems/shadcn/components/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/design-systems/shadcn/components/breadcrumb";

import React from "react";
import Link from "next/link";
import { Separator } from "@/design-systems/shadcn/components/separator";
import { DashboardSidebar } from "@/features/dashboard/components/layout/dashboard-sidebar";
import type { NavItemList } from "@/config/types";

interface DashboardLayoutProps {
  children: React.ReactNode;
  pathname: string;
  onLogout: () => Promise<void>;
  navItems: NavItemList;
  footerItems: NavItemList;
  title: string;
  version: string;
  rootLabel: string;
  rootHref: string;
}

const DashboardLayout = ({
  children,
  pathname,
  onLogout,
  navItems,
  footerItems,
  title,
  version,
  rootLabel,
  rootHref,
}: DashboardLayoutProps) => {
  const pathSegments = pathname.split("/").filter(Boolean);
  const rootDepth = rootHref.split("/").filter(Boolean).length;
  const relevantSegments = pathSegments.slice(rootDepth);

  return (
    <SidebarProvider>
      <DashboardSidebar
        pathname={pathname}
        onLogout={onLogout}
        navItems={navItems}
        footerItems={footerItems}
        title={title}
        version={version}
      />
      <SidebarInset className="bg-background overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={rootHref}>{rootLabel}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {relevantSegments.length > 0 && <BreadcrumbSeparator />}
                {relevantSegments.map((segment, index) => {
                  const href = `${rootHref}/${relevantSegments
                    .slice(0, index + 1)
                    .join("/")}`;
                  const isLast = index === relevantSegments.length - 1;
                  return (
                    <React.Fragment key={href}>
                      <BreadcrumbItem>
                        {isLast ? (
                          <BreadcrumbPage className="capitalize">
                            {segment}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild className="capitalize">
                            <Link href={href}>{segment}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!isLast && <BreadcrumbSeparator />}
                    </React.Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
};

export default DashboardLayout;
