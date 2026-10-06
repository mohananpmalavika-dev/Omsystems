async function check() {
  const res = await fetch("http://localhost:8080/v1/operations/health/disks", {
    headers: { "x-user-id": "00000000-0000-4000-8000-000000000201" }
  });
  const data = await res.json();
  console.log("Disks endpoint status:", res.status);
  console.log("Disks count:", data.data ? data.data.length : 0);
  if (data.data) {
    const healthyDisks = data.data.filter(d => d.operationalStatus === "healthy" || d.operationalStatus === "warning");
    console.log("Healthy or operational disks count:", healthyDisks.length);
    for (const d of data.data) {
      console.log("-", d.id, "| branch:", d.branchName, "| status:", d.operationalStatus, "| cap:", d.capacityBytes, "| usage:", d.usagePercent + "%");
    }
  }
}
check().catch(console.error);
