# Check Analytics Engine Status and Logs

Write-Host "=== Checking Analytics Engine Deployment ===" -ForegroundColor Cyan

# Check pod status
Write-Host "`n1. Pod Status:" -ForegroundColor Yellow
kubectl get pods -n sentinel-analytics -l app=analytics-engine

# Check recent logs
Write-Host "`n2. Recent Logs (Last 50 lines):" -ForegroundColor Yellow
kubectl logs -n sentinel-analytics deployment/analytics-engine --tail=50

# Check for person detections
Write-Host "`n3. Person Detections:" -ForegroundColor Yellow
kubectl logs -n sentinel-analytics deployment/analytics-engine --tail=200 | Select-String "person"

# Check for helmet processing
Write-Host "`n4. Helmet Processing:" -ForegroundColor Yellow
kubectl logs -n sentinel-analytics deployment/analytics-engine --tail=200 | Select-String "helmet"

# Check for errors
Write-Host "`n5. Errors/Warnings:" -ForegroundColor Yellow
kubectl logs -n sentinel-analytics deployment/analytics-engine --tail=200 | Select-String "error|ERROR|warn|WARN"

# Check ConfigMap
Write-Host "`n6. Current Configuration:" -ForegroundColor Yellow
kubectl get configmap analytics-engine-config -n sentinel-analytics -o yaml | Select-String "HELMET|PERSON"

Write-Host "`n=== Done ===" -ForegroundColor Cyan
