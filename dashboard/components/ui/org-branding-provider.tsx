"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { organizationApi } from "@/lib/api-client";

export interface OrgBranding {
  orgName: string;
  orgCode: string;
  logoUrl: string | null;
  tagline: string;
}

interface OrgBrandingContextValue {
  branding: OrgBranding;
  updateBranding: (branding: Partial<OrgBranding>) => void;
  setLogo: (logoDataUrl: string | null) => void;
}

const DEFAULT_BRANDING: OrgBranding = {
  orgName: "KryptonVision",
  orgCode: "SENTINEL-CORP",
  logoUrl: null,
  tagline: "Enterprise Surveillance OS",
};

const BRANDING_STORAGE_KEY = "sentinel-grid-org-branding";

const OrgBrandingContext = createContext<OrgBrandingContextValue>({
  branding: DEFAULT_BRANDING,
  updateBranding: () => {},
  setLogo: () => {},
});

export function OrgBrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<OrgBranding>(DEFAULT_BRANDING);

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

    // 2. Fetch fresh organization details from API
    organizationApi
      .getTree()
      .then((res: any) => {
        if (res && res.tree && res.tree.length > 0) {
          const rootOrg = res.tree[0];
          setBranding((prev) => {
            const updated: OrgBranding = {
              ...prev,
              orgName: rootOrg.name || prev.orgName,
              orgCode: rootOrg.code || prev.orgCode,
              logoUrl: rootOrg.logoUrl || prev.logoUrl,
            };
            try {
              localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(updated));
            } catch (err) {}
            return updated;
          });
        }
      })
      .catch(() => {
        // Fallback gracefully if API is not yet loaded or offline
      });
  }, []);

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
    <OrgBrandingContext.Provider value={{ branding, updateBranding, setLogo }}>
      {children}
    </OrgBrandingContext.Provider>
  );
}

export function useOrgBranding() {
  return useContext(OrgBrandingContext);
}
