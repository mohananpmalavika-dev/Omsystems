/**
 * Recipient Resolver
 * 
 * Resolves operational recipients (branch officers, regional managers, SOC operators)
 * independently of delivery providers based on alert scope and priority.
 */

import type {
  NotificationChannel,
  NotificationContext,
  ResolvedRecipient,
} from "../domain/notification.types.js";

export class RecipientResolver {
  private branchContacts: Map<string, ResolvedRecipient[]> = new Map();
  private defaultControlRoom: ResolvedRecipient = {
    userId: "user-soc-01",
    name: "Head Office Central Control Room",
    email: "soc-alerts@bank-corp.internal",
    mobile: "+919876543210",
    role: "SURVEILLANCE_OPERATOR",
  };

  constructor() {
    // Seed sample branch security officers
    this.branchContacts.set("branch-178", [
      {
        userId: "user-178-sec",
        name: "Aluva Branch Security Officer",
        email: "security.aluva@bank-corp.internal",
        mobile: "+919400112233",
        role: "BRANCH_SECURITY_OFFICER",
      },
      {
        userId: "user-178-mgr",
        name: "Aluva Branch Manager",
        email: "bm.aluva@bank-corp.internal",
        mobile: "+919400445566",
        role: "BRANCH_MANAGER",
      },
    ]);

    this.branchContacts.set("branch-kochi", [
      {
        userId: "user-kochi-sec",
        name: "Kochi Main Branch Security Officer",
        email: "security.kochi@bank-corp.internal",
        mobile: "+919447001122",
        role: "BRANCH_SECURITY_OFFICER",
      },
      {
        userId: "user-kochi-mgr",
        name: "Kochi Main Branch Manager",
        email: "bm.kochi@bank-corp.internal",
        mobile: "+919447334455",
        role: "BRANCH_MANAGER",
      },
    ]);
  }

  registerBranchContact(branchId: string, recipient: ResolvedRecipient) {
    const list = this.branchContacts.get(branchId) ?? [];
    list.push(recipient);
    this.branchContacts.set(branchId, list);
  }

  async resolve(context: NotificationContext, channel: NotificationChannel): Promise<ResolvedRecipient[]> {
    if (channel === "system_log") {
      return [{ name: "System Audit Logger", role: "SIEM_AUDIT" }];
    }

    if (channel === "dashboard") {
      return [this.defaultControlRoom];
    }

    const branchList = context.branchId ? this.branchContacts.get(context.branchId) ?? [] : [];

    if (branchList.length > 0) {
      if (context.priority === "P1") {
        // P1 notifies both Security Officer and Branch Manager + Central SOC
        return branchList;
      }
      // P2/P3 notifies Branch Security Officer only
      return [branchList[0] || this.defaultControlRoom];
    }

    // Default fallback
    return [this.defaultControlRoom];
  }
}

export const recipientResolver = new RecipientResolver();
