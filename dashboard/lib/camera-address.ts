export function normalizeCameraIp(value: string) {
  const input = value.trim();
  if (!input) return "";

  try {
    const parsed = input.includes("://") ? new URL(input) : new URL(`rtsp://${input}`);
    return parsed.hostname;
  } catch {
    return input.split(/[/?#]/, 1)[0]?.replace(/:\d+$/, "") ?? "";
  }
}

export function isCameraIp(value: string) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}
