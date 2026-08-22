import type { VerifiedEndpoint } from "../domain/notification.types.js";

export interface UserNotificationProfile {
  userId: string;
  tenantId: string;
  displayName: string;
  email?: VerifiedEndpoint | undefined;
  phone?: VerifiedEndpoint | undefined;
  pushDevices: VerifiedEndpoint[];
  enabled: boolean;
}

export class UserDirectoryService {
  private readonly profiles = new Map<string, UserNotificationProfile>();

  constructor() {
  }

  static normalizePhoneNumber(raw: string): string {
    const cleaned = raw.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.length === 10) return `+91${cleaned}`;
    if (cleaned.startsWith("91") && cleaned.length === 12) return `+${cleaned}`;
    if (cleaned.startsWith("0")) return `+91${cleaned.slice(1)}`;
    return `+${cleaned}`;
  }

  async getNotificationProfile(
    tenantId: string,
    userId: string,
  ): Promise<UserNotificationProfile | null> {
    const key = `${tenantId}:${userId}`;
    const profile = this.profiles.get(key);
    if (!profile || !profile.enabled) return null;
    return profile;
  }

  registerUser(profile: UserNotificationProfile) {
    const key = `${profile.tenantId}:${profile.userId}`;
    this.profiles.set(key, profile);
  }

  private seedDefaultUsers() {
    const tenantId = "tenant-bank-01";

    // 1. Central HO Operator (On active shift)
    this.registerUser({
      userId: "user-ho-sanjay",
      tenantId,
      displayName: "Sanjay P (HO SOC Operator)",
      enabled: true,
      email: {
        id: "ep-ho-email",
        type: "EMAIL",
        value: "sanjay.soc@bank.internal",
        verified: true,
        verifiedAt: new Date("2026-01-01"),
        enabled: true,
        isPrimary: true,
      },
      phone: {
        id: "ep-ho-phone",
        type: "PHONE",
        value: "+919876543210",
        verified: true,
        verifiedAt: new Date("2026-01-01"),
        enabled: true,
        isPrimary: true,
      },
      pushDevices: [
        {
          id: "ep-ho-push-web",
          type: "PUSH_DEVICE",
          value: "token_web_ho_sanjay",
          verified: true,
          enabled: true,
          metadata: { platform: "WEB", deviceName: "SOC Console Chrome" },
        },
      ],
    });

    // 2. Central Surveillance Manager
    this.registerUser({
      userId: "user-mgr-priya",
      tenantId,
      displayName: "Priya Menon (Surveillance Head)",
      enabled: true,
      email: {
        id: "ep-mgr-email",
        type: "EMAIL",
        value: "priya.menon@bank.internal",
        verified: true,
        verifiedAt: new Date("2026-01-01"),
        enabled: true,
        isPrimary: true,
      },
      phone: {
        id: "ep-mgr-phone",
        type: "PHONE",
        value: "+919447112233",
        verified: true,
        verifiedAt: new Date("2026-01-01"),
        enabled: true,
        isPrimary: true,
      },
      pushDevices: [
        {
          id: "ep-mgr-push-ios",
          type: "PUSH_DEVICE",
          value: "token_ios_priya",
          verified: true,
          enabled: true,
          metadata: { platform: "IOS", deviceName: "iPhone 15 Pro" },
        },
      ],
    });

    // 3. Thrissur Branch Manager
    this.registerUser({
      userId: "user-bm-thrissur",
      tenantId,
      displayName: "Ajith Kumar (Branch Manager Thrissur 14)",
      enabled: true,
      email: {
        id: "ep-bm-thrissur-email",
        type: "EMAIL",
        value: "bm.thrissur14@bank.internal",
        verified: true,
        verifiedAt: new Date("2026-01-01"),
        enabled: true,
        isPrimary: true,
      },
      phone: {
        id: "ep-bm-thrissur-phone",
        type: "PHONE",
        value: "+919400114477",
        verified: true,
        verifiedAt: new Date("2026-01-01"),
        enabled: true,
        isPrimary: true,
      },
      pushDevices: [],
    });

    // 4. Regional Security Officer (Thrissur Region)
    this.registerUser({
      userId: "user-rso-rahul",
      tenantId,
      displayName: "Rahul Nair (Regional Security Officer)",
      enabled: true,
      email: {
        id: "ep-rso-email",
        type: "EMAIL",
        value: "rahul.security@bank.internal",
        verified: true,
        verifiedAt: new Date("2026-01-01"),
        enabled: true,
        isPrimary: true,
      },
      phone: {
        id: "ep-rso-phone",
        type: "PHONE",
        value: "+919446998877",
        verified: true,
        verifiedAt: new Date("2026-01-01"),
        enabled: true,
        isPrimary: true,
      },
      pushDevices: [
        {
          id: "ep-rso-push-android",
          type: "PUSH_DEVICE",
          value: "token_android_rahul",
          verified: true,
          enabled: true,
          metadata: { platform: "ANDROID", deviceName: "Pixel 9 Pro" },
        },
      ],
    });

    // 5. Unverified User (For Testing Phone Verification Rejection)
    this.registerUser({
      userId: "user-unverified-bm",
      tenantId,
      displayName: "Kiran Dev (Unverified Manager)",
      enabled: true,
      email: {
        id: "ep-unverified-email",
        type: "EMAIL",
        value: "kiran@bank.internal",
        verified: true,
        enabled: true,
      },
      phone: {
        id: "ep-unverified-phone",
        type: "PHONE",
        value: "+919000000000",
        verified: false, // NOT VERIFIED
        enabled: true,
      },
      pushDevices: [],
    });
  }
}

export const userDirectoryService = new UserDirectoryService();
