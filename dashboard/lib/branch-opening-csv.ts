type OpeningCsvRow = {
  occurredAt: string | null;
  localDate: string;
  zoneName: string | null;
  branchName: string;
  personCount: number | null;
  outcome: string;
  cameraName: string | null;
  locationType?: string | null;
  photoUrl: string | null;
};

function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function branchOpeningCsv(rows: OpeningCsvRow[], origin: string) {
  const records = [
    ["Opening time (IST)", "Zone", "Branch", "Persons detected", "Result", "Camera", "Camera location", "Photo URL"],
    ...rows.map((row) => [
      row.occurredAt ? new Date(row.occurredAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : row.localDate,
      row.zoneName ?? "Unassigned", row.branchName, row.personCount, row.outcome, row.cameraName,
      row.locationType?.replaceAll("-", " ") || "Unassigned",
      row.photoUrl ? `${origin}${row.photoUrl}` : "Unavailable",
    ]),
  ];
  return "\uFEFF" + records.map((record) => record.map(csvCell).join(",")).join("\r\n");
}
