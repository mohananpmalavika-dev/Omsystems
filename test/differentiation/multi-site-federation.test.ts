import { describe, it, expect } from "vitest";
import { MultiSiteFederationService } from "../../src/federation/services/multi-site-federation.service.js";

describe("Multi-Site Federation & Store-and-Forward (Phase 33)", () => {
  it("registers hierarchical federation topology and updates connection state", () => {
    const fed = new MultiSiteFederationService();

    fed.registerSite({
      siteId: "HO-CENTRAL",
      tenantId: "bank-corp",
      siteName: "Head Office Central Command",
      tier: "HEAD_OFFICE",
      connectionStatus: "ONLINE",
      endpointUrl: "https://ho.kryptovision.bank/api",
      backlogCount: 0,
    });

    fed.registerSite({
      siteId: "BRANCH-404",
      tenantId: "bank-corp",
      siteName: "Downtown Branch 404",
      tier: "EDGE_BRANCH",
      parentSiteId: "HO-CENTRAL",
      connectionStatus: "ONLINE",
      endpointUrl: "https://br404.edge.bank/api",
      backlogCount: 0,
    });

    expect(fed.getSite("BRANCH-404")?.tier).toBe("EDGE_BRANCH");
    fed.updateConnectionStatus("BRANCH-404", "OFFLINE");
    expect(fed.getSite("BRANCH-404")?.connectionStatus).toBe("OFFLINE");
  });

  it("queues store-and-forward events when offline and drains them upon restoration", async () => {
    const fed = new MultiSiteFederationService();

    fed.registerSite({
      siteId: "BRANCH-404",
      tenantId: "bank-corp",
      siteName: "Downtown Branch 404",
      tier: "EDGE_BRANCH",
      connectionStatus: "OFFLINE",
      endpointUrl: "https://br404.edge.bank/api",
      backlogCount: 0,
    });

    // Enqueue 2 incidents while offline
    const item1 = await fed.enqueueStoreAndForward("bank-corp", "BRANCH-404", "INCIDENT", "inc-1", {
      title: "ATM Power Cut",
    });
    const item2 = await fed.enqueueStoreAndForward("bank-corp", "BRANCH-404", "AUDIT_RECORD", "aud-2", {
      action: "VAULT_OPENED",
    });

    expect(item1.synced).toBe(false);
    expect(item2.synced).toBe(false);
    expect(fed.getSite("BRANCH-404")?.backlogCount).toBe(2);

    // Attempting to drain while still OFFLINE should fail to sync
    const drainOffline = await fed.drainSyncQueue("BRANCH-404");
    expect(drainOffline.syncedCount).toBe(0);
    expect(drainOffline.remainingBacklog).toBe(2);

    // WAN connection restores
    fed.updateConnectionStatus("BRANCH-404", "ONLINE");
    const drainOnline = await fed.drainSyncQueue("BRANCH-404");

    expect(drainOnline.syncedCount).toBe(2);
    expect(drainOnline.remainingBacklog).toBe(0);
    expect(fed.getSite("BRANCH-404")?.lastSyncAt).toBeDefined();
  });

  it("distributes policies centrally and executes cross-branch searches", async () => {
    const fed = new MultiSiteFederationService();

    fed.registerSite({
      siteId: "BR-01",
      tenantId: "bank-corp",
      siteName: "Branch 01",
      tier: "EDGE_BRANCH",
      connectionStatus: "ONLINE",
      endpointUrl: "https://br01.bank/api",
      backlogCount: 0,
    });

    fed.registerSite({
      siteId: "BR-02",
      tenantId: "bank-corp",
      siteName: "Branch 02",
      tier: "EDGE_BRANCH",
      connectionStatus: "ONLINE",
      endpointUrl: "https://br02.bank/api",
      backlogCount: 0,
    });

    const policy = fed.distributePolicy(
      "bank-corp",
      "MANDATORY_90_DAY_RETENTION",
      1,
      { minDays: 90, p1ImmediateHold: true },
      "EDGE_BRANCH"
    );

    expect(policy.status).toBe("APPLIED");

    const searchResults = await fed.executeCrossBranchSearch({
      tenantId: "bank-corp",
      searchTerm: "SUSPECT_VEHICLE_DL12AB1234",
    });

    expect(searchResults.length).toBe(2);
    expect(searchResults[0]?.branchId).toBe("BR-01");
  });
});
