# Check if the new endpoint is deployed
# Run this script every minute to see when deployment completes

$url = "https://sentinel-grid-monitoring-s38w.onrender.com/api/admin/system/gateways/test-id"
$token = "YOUR_AUTH_TOKEN_HERE"  # Replace with your actual token

Write-Host "Checking if gateway DELETE endpoint is deployed..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest `
        -Uri $url `
        -Method DELETE `
        -Headers @{
            "Authorization" = "Bearer $token"
        } `
        -SkipHttpErrorCheck

    $statusCode = $response.StatusCode
    
    Write-Host "`nStatus Code: $statusCode" -ForegroundColor Yellow
    
    switch ($statusCode) {
        501 {
            Write-Host "❌ Still getting 501 - Deployment not complete yet" -ForegroundColor Red
            Write-Host "   Wait 2-3 more minutes and try again" -ForegroundColor Gray
        }
        404 {
            Write-Host "✅ Endpoint is deployed! (404 = gateway not found, which is expected)" -ForegroundColor Green
            Write-Host "   The endpoint exists and is working correctly" -ForegroundColor Gray
        }
        401 {
            Write-Host "✅ Endpoint is deployed! (401 = need valid auth token)" -ForegroundColor Green
            Write-Host "   Update the token in this script and try again" -ForegroundColor Gray
        }
        403 {
            Write-Host "✅ Endpoint is deployed! (403 = no permission)" -ForegroundColor Green
            Write-Host "   The endpoint exists, you just don't have permission for this gateway" -ForegroundColor Gray
        }
        204 {
            Write-Host "✅ Endpoint is deployed and deletion succeeded!" -ForegroundColor Green
        }
        default {
            Write-Host "⚠️  Unexpected status: $statusCode" -ForegroundColor Yellow
            Write-Host $response.Content
        }
    }
    
} catch {
    Write-Host "Error checking deployment: $_" -ForegroundColor Red
}

Write-Host "`nTo check Render deployment logs:" -ForegroundColor Cyan
Write-Host "1. Go to: https://dashboard.render.com/" -ForegroundColor Gray
Write-Host "2. Select your service: sentinel-grid-monitoring1" -ForegroundColor Gray
Write-Host "3. Click 'Logs' tab" -ForegroundColor Gray
Write-Host "4. Look for 'Deploy succeeded' message" -ForegroundColor Gray
