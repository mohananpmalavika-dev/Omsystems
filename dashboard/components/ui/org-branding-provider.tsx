"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { organizationApi } from "@/lib/api-client";
import { isPublicDashboardRoute } from "@/lib/session-navigation";
import { usePathname } from "next/navigation";

export interface OrgBranding {
  organizationId: string | null;
  orgName: string;
  orgCode: string;
  logoUrl: string | null;
  tagline: string;
}

interface OrgBrandingContextValue {
  branding: OrgBranding;
  organizations: Array<{ id: string; name: string; code?: string; logoUrl?: string | null }>;
  selectOrganization: (organizationId: string) => void;
  updateBranding: (branding: Partial<OrgBranding>) => void;
  setLogo: (logoDataUrl: string | null) => void;
}

const DEFAULT_BRANDING: OrgBranding = {
  organizationId: null,
  orgName: "KryptonVision",
  orgCode: "SENTINEL-CORP",
  logoUrl: null,
  tagline: "Enterprise Surveillance OS",
};

const BRANDING_STORAGE_KEY = "sentinel-grid-org-branding";
const ORGANIZATION_ID_STORAGE_KEY = "sentinel-grid-active-organization";

const OrgBrandingContext = createContext<OrgBrandingContextValue>({
  branding: DEFAULT_BRANDING,
  organizations: [],
  selectOrganization: () => {},
  updateBranding: () => {},
  setLogo: () => {},
});

export function OrgBrandingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [branding, setBranding] = useState<OrgBranding>(DEFAULT_BRANDING);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; code?: string; logoUrl?: string | null }>>([]);
  const hasLoadedOrganizations = useRef(false);

  const applyOrganization = (organization: { id: string; name: string; code?: string; logoUrl?: string | null }) => {
    const next: OrgBranding = {
      organizationId: organization.id,
      orgName: organization.name || DEFAULT_BRANDING.orgName,
      orgCode: organization.code || DEFAULT_BRANDING.orgCode,
      logoUrl: organization.logoUrl || null,
      tagline: DEFAULT_BRANDING.tagline,
    };
    setBranding(next);
    try {
      localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(next));
      localStorage.setItem(ORGANIZATION_ID_STORAGE_KEY, organization.id);
    } catch {}
  };

  useEffect(() => {
    // 1. Load from localStorage for instantaneous rendering
    try {
      const cached = localStorage.getItem(BRANDING_STORAGE_KEY);
      if (cached) {
        setBranding(JSON.parse(cached));
      }
    } catch (e) {
      console.error("Failed to load cached branding:", e);
    }

    // Public pages do not need organization data to render.
    if (isPublicDashboardRoute(pathname)) {
      hasLoadedOrganizations.current = false;
      return;
    }
    if (hasLoadedOrganizations.current) return;

    // Refresh in the background without allowing an unavailable API to hold
    // the page open during startup.
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2000);
    Promise.race([
      organizationApi.getTree(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("Organization refresh timed out")), { once: true });
      }),
    ])
      .then((res: any) => {
        const roots = Array.isArray(res?.data) ? res.data : Array.isArray(res?.tree) ? res.tree : [];
        const organizations = roots.map((root: any) => ({ id: root.id, name: root.name, code: root.code, logoUrl: root.logoUrl ?? root.metadata?.logoUrl ?? null }));
        setOrganizations(organizations);
        hasLoadedOrganizations.current = true;
        const savedId = localStorage.getItem(ORGANIZATION_ID_STORAGE_KEY);
        const selected = organizations.find((organization: any) => organization.id === savedId) ?? organizations[0];
        if (selected) applyOrganization(selected);
      })
      .catch(() => {
        // Fallback gracefully if API is not yet loaded or offline
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [pathname]);

  const selectOrganization = (organizationId: string) => {
    const selected = organizations.find((organization) => organization.id === organizationId);
    if (selected) applyOrganization(selected);
  };

  const updateBranding = (updates: Partial<OrgBranding>) => {
    setBranding((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("Failed to persist branding:", e);
      }
      return next;
    });
  };

  const setLogo = (logoDataUrl: string | null) => {
    updateBranding({ logoUrl: logoDataUrl });
  };

  return (
    <OrgBrandingContext.Provider value={{ branding, organizations, selectOrganization, updateBranding, setLogo }}>
      {children}
    </OrgBrandingContext.Provider>
  );
}

export function useOrgBranding() {
  return useContext(OrgBrandingContext);
}
