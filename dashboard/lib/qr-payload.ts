export type QrPayload =
  | {
      kind: "credentials";
      username: string;
      password: string;
      ipAddress?: string;
      deviceId?: string;
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

  if (!fields?.username || !fields.password) return { kind: "unsupported" };

  return {
    kind: "credentials",
    username: fields.username,
    password: fields.password,
    ...(fields.ipAddress ? { ipAddress: fields.ipAddress } : {}),
    ...(fields.deviceId ? { deviceId: fields.deviceId } : {}),
  };
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
