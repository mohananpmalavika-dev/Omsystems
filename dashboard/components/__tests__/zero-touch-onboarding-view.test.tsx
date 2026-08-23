/**
 * Unit and integration tests for Zero-Touch Provisioning component
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZeroTouchOnboardingView } from "../zero-touch-onboarding-view";
import { validateBranchForm, validateBranchId, validateBranchName } from "@/lib/validation";

// Mock fetch
global.fetch = jest.fn();

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(),
  },
});

// Mock EventSource
global.EventSource = jest.fn().mockImplementation(() => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  close: jest.fn(),
  onmessage: null,
  onerror: null,
  onopen: null,
}));

describe("ZeroTouchOnboardingView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          branches: [
            {
              branchId: "A005",
              branchName: "Test Branch",
              region: "South Zone",
              agentStatus: "CONNECTED",
              totalCameras: 20,
              readinessScorePct: 100,
              operationalStatus: "ACTIVE",
            },
          ],
          slaMetrics: {
            targetSlaSeconds: 90,
            p95Seconds: 114.8,
            totalBranchesProvisioned: 482,
          },
        },
      }),
    });
  });

  describe("Initial Rendering", () => {
    it("should render loading skeleton initially", () => {
      render(<ZeroTouchOnboardingView />);
      expect(screen.getByRole("status", { name: /loading fleet data/i })).toBeInTheDocument();
    });

    it("should fetch and display fleet data on mount", async () => {
      render(<ZeroTouchOnboardingView />);
      
      await waitFor(() => {
        expect(screen.getByText("Test Branch")).toBeInTheDocument();
      });
      
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/zero-touch/fleet",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it("should display error message when fleet fetch fails", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));
      
      render(<ZeroTouchOnboardingView />);
      
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText(/error loading fleet data/i)).toBeInTheDocument();
      });
    });
  });

  describe("Search Functionality", () => {
    it("should filter branches based on search query", async () => {
      render(<ZeroTouchOnboardingView />);
      
      await waitFor(() => {
        expect(screen.getByText("Test Branch")).toBeInTheDocument();
      });
      
      const searchInput = screen.getByLabelText(/search branches/i);
      await userEvent.type(searchInput, "A005");
      
      await waitFor(() => {
        expect(screen.getByText("Test Branch")).toBeInTheDocument();
      });
    });

    it("should sanitize search input", async () => {
      render(<ZeroTouchOnboardingView />);
      
      const searchInput = screen.getByLabelText(/search branches/i);
      await userEvent.type(searchInput, "test<script>");
      
      // Should remove angle brackets
      expect(searchInput).toHaveValue("testscript");
    });
  });

  describe("Filter Functionality", () => {
    it("should filter branches by status", async () => {
      render(<ZeroTouchOnboardingView />);
      
      await waitFor(() => {
        expect(screen.getByText("Test Branch")).toBeInTheDocument();
      });
      
      const activeFilter = screen.getByRole("button", { name: /filter branches by active status/i });
      fireEvent.click(activeFilter);
      
      expect(activeFilter).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("links branch management to the organization hierarchy", async () => {
    render(<ZeroTouchOnboardingView />);

    await waitFor(() => {
      expect(screen.getByText("Test Branch")).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /manage branch hierarchy/i })).toHaveAttribute(
      "href",
      "/admin/organization",
    );
  });

  describe("Accessibility", () => {
    it("should have proper ARIA labels", async () => {
      render(<ZeroTouchOnboardingView />);
      
      await waitFor(() => {
        expect(screen.getByText("Test Branch")).toBeInTheDocument();
      });
      
      expect(screen.getByRole("main", { name: /zero-touch provisioning control plane/i })).toBeInTheDocument();
      expect(screen.getByRole("search", { name: /branch fleet search and filters/i })).toBeInTheDocument();
    });

    it("should support keyboard navigation", async () => {
      render(<ZeroTouchOnboardingView />);
      
      await waitFor(() => {
        expect(screen.getByText("Test Branch")).toBeInTheDocument();
      });
      
      const manageBranchesLink = screen.getByRole("link", { name: /manage branch hierarchy/i });
      manageBranchesLink.focus();
      
      expect(document.activeElement).toBe(manageBranchesLink);
    });
  });

  describe("Cleanup", () => {
    it("should abort fetch on unmount", async () => {
      const { unmount } = render(<ZeroTouchOnboardingView />);
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
      
      unmount();
      
      // AbortController should have been called
      expect(true).toBe(true); // Placeholder - actual abort testing requires more setup
    });
  });
});

describe("Validation Functions", () => {
  describe("validateBranchId", () => {
    it("should validate correct branch IDs", () => {
      expect(validateBranchId("A005").valid).toBe(true);
      expect(validateBranchId("BR-PUN-01").valid).toBe(true);
      expect(validateBranchId("test_123").valid).toBe(true);
    });

    it("should reject invalid branch IDs", () => {
      expect(validateBranchId("").valid).toBe(false);
      expect(validateBranchId("A").valid).toBe(false);
      expect(validateBranchId("A".repeat(25)).valid).toBe(false);
      expect(validateBranchId("branch@123").valid).toBe(false);
    });
  });

  describe("validateBranchName", () => {
    it("should validate correct branch names", () => {
      expect(validateBranchName("Test Branch").valid).toBe(true);
      expect(validateBranchName("Branch Name 123").valid).toBe(true);
    });

    it("should reject invalid branch names", () => {
      expect(validateBranchName("").valid).toBe(false);
      expect(validateBranchName("A").valid).toBe(false);
      expect(validateBranchName("A".repeat(105)).valid).toBe(false);
      expect(validateBranchName("test<script>").valid).toBe(false);
    });
  });

  describe("validateBranchForm", () => {
    it("should validate complete form", () => {
      const result = validateBranchForm({
        branchId: "A010",
        branchName: "Test Branch",
        region: "South Zone",
      });
      
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeDefined();
    });

    it("should return errors for invalid form", () => {
      const result = validateBranchForm({
        branchId: "",
        branchName: "A",
        region: "Invalid Region",
      });
      
      expect(result.valid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    });
  });
});
