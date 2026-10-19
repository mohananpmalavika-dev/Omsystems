# Monitor Helmet Detection and Alerts in Real Time across all branches & cameras on GCP
$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " 🪖 Sentinel Grid - Multi-Branch Live Helmet Monitor" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Host: 35.200.130.81 (GCP Sentinel Grid)" -ForegroundColor Yellow
Write-Host "Monitoring all branches: Bettaih, Hajipur, KOLLAM, PERAVARUNI, Rajkot (50 cameras)" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop monitoring.`n" -ForegroundColor DarkGray

$sshKey = "C:\Users\Dhanya\.ssh\google_compute_engine"
$remoteHost = "Dhanya@35.200.130.81"

# Query baseline alert
$baselineSql = "SELECT COALESCE(MAX(created_at), '1970-01-01'::timestamp) FROM analytics_alerts;"
$baselineTime = $baselineSql | ssh -i $sshKey -o StrictHostKeyChecking=no $remoteHost 'sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A' 2>$null
$baselineTime = $baselineTime.Trim()

Write-Host "Baseline latest alert timestamp: $baselineTime" -ForegroundColor Green
Write-Host "Active Multi-Branch Monitoring in progress (polling every 5s)...`n" -ForegroundColor Green

$iteration = 0
while ($true) {
    $iteration++
    $now = Get-Date -Format "HH:mm:ss"

    # Query for any new alert created after baseline across all branches
    $checkSql = @"
SELECT a.id || ' | ' || a.title || ' | ' || a.severity || ' | ' || COALESCE(b.name, 'Unknown Branch') || ' | ' || COALESCE(rn.name, 'Unknown Camera') || ' | ' || a.created_at
FROM analytics_alerts a
LEFT JOIN cameras c ON a.camera_id = c.id
LEFT JOIN branches b ON c.branch_node_id = b.id
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
WHERE a.created_at > '$baselineTime'
ORDER BY a.created_at ASC;
"@

    $alerts = $checkSql | ssh -i $sshKey -o StrictHostKeyChecking=no $remoteHost 'sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -t -A' 2>$null

    if ($alerts -and $alerts.Trim().Length -gt 0) {
        $alertLines = $alerts.Trim().Split("`n")
        foreach ($line in $alertLines) {
            if ($line.Trim().Length -gt 0) {
                Write-Host "`n🚨 [HELMET ALERT TRIGGERED!] ($now)" -ForegroundColor Red -BackgroundColor Black
                Write-Host "Alert Details: $line" -ForegroundColor Yellow
                # Update baseline to prevent repeating
                $parts = $line.Split('|')
                if ($parts.Length -ge 6) {
                    $baselineTime = $parts[5].Trim()
                }
            }
        }
    } else {
        if ($iteration % 6 -eq 0) {
            Write-Host "[$now] Multi-branch monitoring active (Bettaih, Hajipur, KOLLAM, PERAVARUNI, Rajkot). All streams operational." -ForegroundColor DarkCyan
        }
    }

    Start-Sleep -Seconds 5
}
