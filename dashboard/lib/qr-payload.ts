export type QrPayload =
  | {
      kind: "credentials";
      username: string;
      password: string;
      ipAddress?: string;
      deviceId?: string;
    }
  | {
      kind: "device-uid";
      uid: string;
      model?: string;
      productCode?: string;
      serialNumber?: string;
      ipAddress?: string;
    }
  | {
      kind: "truecloud-share";
      expiresAt?: Date;
      expired: boolean;
    }
  | {
      kind: "unsupported";
    };

type QrFields = {
  username?: string;
  password?: string;
  ipAddress?: string;
  deviceId?: string;
};

export function parseQrPayload(rawPayload: string, now = Date.now()): QrPayload {
  const payload = rawPayload.trim();
  if (!payload) return { kind: "unsupported" };

  const share = parseTrueCloudShare(payload, now);
  if (share) return share;

  const fields = parseJsonFields(payload)
    ?? parseUrlFields(payload)
    ?? parseKeyValueFields(payload)
    ?? parseCommaSeparatedFields(payload);

  if (fields?.username && fields.password) {
    return {
      kind: "credentials",
      username: fields.username,
      password: fields.password,
      ...(fields.ipAddress ? { ipAddress: fields.ipAddress } : {}),
      ...(fields.deviceId ? { deviceId: fields.deviceId } : {}),
    };
  }

  // Check if payload is a Device UID / Serial sticker (e.g. 4835592944, 09GV062534, T18061, or P2P alphanumeric UID)
  const cleaned = payload.replace(/[\r\n\t]/g, " ").trim();
  const uidMatch = cleaned.match(/^([A-Za-z0-9_-]{6,32})$/);
  if (uidMatch || fields?.deviceId || cleaned.includes("T18061") || /^\d{8,16}$/.test(cleaned)) {
    const uid = fields?.deviceId || uidMatch?.[1] || cleaned.split(" ")[0];
    return {
      kind: "device-uid",
      uid: uid,
      model: cleaned.includes("T18061") ? "T18061-W" : undefined,
      productCode: cleaned.includes("T18061-BA") ? "T18061-BA" : undefined,
      serialNumber: uid,
    };
  }

  return { kind: "unsupported" };
}

function parseTrueCloudShare(payload: string, now: number): Extract<QrPayload, { kind: "truecloud-share" }> | undefined {
  try {
    const url = new URL(payload);
    if (
      url.hostname.toLowerCase() !== "openapi.dvr163.com" ||
      url.pathname !== "/share/device" ||
      url.searchParams.get("method") !== "new_use_qrcode"
    ) {
      return undefined;
    }

    const expiresAt = parseUnixTimestamp(url.searchParams.get("expiredTime"));
    return {
      kind: "truecloud-share",
      ...(expiresAt ? { expiresAt } : {}),
      expired: expiresAt ? expiresAt.getTime() <= now : false,
    };
  } catch {
    return undefined;
  }
}

function parseJsonFields(payload: string): QrFields | undefined {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return fieldsFromRecord(parsed as Record<string, unknown>);
  } catch {
    return undefined;
  }
}

function parseUrlFields(payload: string): QrFields | undefined {
  try {
    const url = new URL(payload);
    return fieldsFromRecord(Object.fromEntries(url.searchParams.entries()));
  } catch {
    return undefined;
  }
}

function parseKeyValueFields(payload: string): QrFields | undefined {
  if (!payload.includes(";") || !payload.includes(":")) return undefined;

  const entries: Record<string, string> = {};
  for (const item of payload.split(";")) {
    const separatorIndex = item.indexOf(":");
    if (separatorIndex <= 0) continue;
    entries[item.slice(0, separatorIndex).trim()] = item.slice(separatorIndex + 1).trim();
  }
  return fieldsFromRecord(entries);
}

function parseCommaSeparatedFields(payload: string): QrFields | undefined {
  const values = payload.split(",").map((value) => value.trim());
  if (values.length < 3) return undefined;
  return {
    deviceId: values[0] || undefined,
    username: values[1] || undefined,
    password: values[2] || undefined,
    ipAddress: values[3] || undefined,
  };
}

function fieldsFromRecord(record: Record<string, unknown>): QrFields {
  const values = new Map(
    Object.entries(record).map(([key, value]) => [key.trim().toLowerCase(), typeof value === "string" ? value.trim() : ""]),
  );
  return {
    username: firstValue(values, ["user", "username"]),
    password: firstValue(values, ["pwd", "password", "pass"]),
    ipAddress: firstValue(values, ["ip", "ipaddress", "ip_address", "host"]),
    deviceId: firstValue(values, ["id", "deviceid", "device_id", "serial", "serialnumber"]),
  };
}

function firstValue(values: Map<string, string>, keys: string[]) {
  return keys.map((key) => values.get(key)).find(Boolean);
}

function parseUnixTimestamp(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds)) return undefined;
  return new Date(seconds * 1_000);
}
