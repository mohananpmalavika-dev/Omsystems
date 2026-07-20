# Sentinel Grid - One-Click Deployment (Windows)
# PowerShell Version

$ErrorActionPreference = "Stop"

Write-Host "🚀 Sentinel Grid - One-Click Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Please install Node.js 22+" -ForegroundColor Red
    exit 1
}

try {
    $npmVersion = npm --version
    Write-Host "✅ npm found: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm not found" -ForegroundColor Red
    exit 1
}

try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Docker not found (optional for local testing)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎯 Choose deployment target:" -ForegroundColor Cyan
Write-Host "1) Vercel (Dashboard only)"
Write-Host "2) Railway (Full backend)"
Write-Host "3) Self-hosted (Docker Compose)"
Write-Host "4) Test local cameras (Quick start)"
Write-Host ""
$choice = Read-Host "Enter choice [1-4]"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "📦 Deploying Dashboard to Vercel..." -ForegroundColor Yellow
        
        # Install Vercel CLI if not present
        try {
            vercel --version | Out-Null
        } catch {
            Write-Host "Installing Vercel CLI..." -ForegroundColor Yellow
            npm install -g vercel
        }
        
        # Deploy
        Set-Location dashboard
        Write-Host ""
        Write-Host "🔑 You'll need to set these environment variables in Vercel:" -ForegroundColor Cyan
        Write-Host "  CONTROL_PLANE_INTERNAL_URL=https://your-api-url.railway.app"
        Write-Host "  MEDIA_GATEWAY_INTERNAL_URL=https://your-media-url.railway.app"
        Write-Host ""
        Read-Host "Press Enter to continue with Vercel deployment..."
        
        vercel --prod
        
        Write-Host "✅ Dashboard deployed to Vercel!" -ForegroundColor Green
    }
    
    "2" {
        Write-Host ""
        Write-Host "📦 Deploying Backend to Railway..." -ForegroundColor Yellow
        
        # Install Railway CLI if not present
        try {
            railway --version | Out-Null
        } catch {
            Write-Host "Installing Railway CLI..." -ForegroundColor Yellow
            npm install -g @railway/cli
        }
        
        Write-Host ""
        Write-Host "🔑 Logging into Railway..." -ForegroundColor Yellow
        railway login
        
        Write-Host ""
        Write-Host "Creating new Railway project..." -ForegroundColor Yellow
        railway init
        
        Write-Host ""
        Write-Host "📊 Adding PostgreSQL database..." -ForegroundColor Yellow
        railway add -d postgres
        
        Write-Host ""
        Write-Host "🚀 Deploying Control Plane..." -ForegroundColor Yellow
        railway up
        
        Write-Host ""
        Write-Host "🔑 Setting environment variables..." -ForegroundColor Yellow
        $bytes = New-Object byte[] 32
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $sharedKey = [Convert]::ToBase64String($bytes)
        
        railway variables set MEDIA_GATEWAY_SHARED_KEY="$sharedKey"
        railway variables set NODE_ENV="production"
        railway variables set LOG_LEVEL="info"
        railway variables set ALLOWED_ORIGINS="https://your-dashboard.vercel.app"
        
        Write-Host "✅ Backend deployed to Railway!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 Next steps:" -ForegroundColor Cyan
        Write-Host "1. Get your Railway URL from: railway open"
        Write-Host "2. Deploy Media Gateway (repeat for media-gateway folder)"
        Write-Host "3. Update Vercel environment variables with Railway URLs"
    }
    
    "3" {
        Write-Host ""
        Write-Host "🐳 Starting local Docker Compose deployment..." -ForegroundColor Yellow
        
        try {
            docker-compose --version | Out-Null
        } catch {
            Write-Host "❌ docker-compose not found. Please install Docker Desktop" -ForegroundColor Red
            exit 1
        }
        
        # Generate secrets
        Write-Host "🔑 Generating secure secrets..." -ForegroundColor Yellow
        
        $mediaKeyBytes = New-Object byte[] 32
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($mediaKeyBytes)
        $mediaKey = [Convert]::ToBase64String($mediaKeyBytes)
        
        $dbPassBytes = New-Object byte[] 24
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($dbPassBytes)
        $dbPass = [Convert]::ToBase64String($dbPassBytes) -replace '[^a-zA-Z0-9]', ''
        
        # Create .env file
        $envContent = @"
# Generated on $(Get-Date)
HOST=0.0.0.0
PORT=8080
LOG_LEVEL=info
NODE_ENV=production

# Database
DATABASE_URL=postgresql://sentinel:${dbPass}@postgres:5432/sentinel
POSTGRES_DB=sentinel
POSTGRES_USER=sentinel
POSTGRES_PASSWORD=${dbPass}

# Security
MEDIA_GATEWAY_SHARED_KEY=${mediaKey}
ALLOWED_ORIGINS=http://localhost:3000

# Media Gateway
CONTROL_PLANE_URL=http://api:8080
MEDIAMTX_API_URL=http://mediamtx:9997
PUBLIC_HLS_BASE_URL=http://localhost:8888
PUBLIC_WEBRTC_BASE_URL=http://localhost:8889
MEDIA_ACCESS_TTL_SECONDS=300
STREAM_SECRETS_JSON={}

# Dashboard
DASHBOARD_DEMO_MODE=false
CONTROL_PLANE_INTERNAL_URL=http://api:8080
MEDIA_GATEWAY_INTERNAL_URL=http://media-gateway:8090
DASHBOARD_DEV_USER_ID=user-global-admin
"@
        
        Set-Content -Path ".env" -Value $envContent
        Write-Host "✅ .env file created" -ForegroundColor Green
        
        # Start services
        Write-Host ""
        Write-Host "🚀 Starting services..." -ForegroundColor Yellow
        docker-compose up -d
        
        Write-Host ""
        Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
        Start-Sleep -Seconds 15
        
        # Check health
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ Control Plane is healthy" -ForegroundColor Green
            }
        } catch {
            Write-Host "⚠️  Control Plane not responding yet" -ForegroundColor Yellow
        }
        
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8090/health" -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ Media Gateway is healthy" -ForegroundColor Green
            }
        } catch {
            Write-Host "⚠️  Media Gateway not responding yet" -ForegroundColor Yellow
        }
        
        Write-Host ""
        Write-Host "✅ Self-hosted deployment complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🌐 Access your services:" -ForegroundColor Cyan
        Write-Host "  Dashboard: http://localhost:3000"
        Write-Host "  API: http://localhost:8080"
        Write-Host "  Media Gateway: http://localhost:8090"
        Write-Host ""
        Write-Host "📊 View logs: docker-compose logs -f"
        Write-Host "🛑 Stop services: docker-compose down"
    }
    
    "4" {
        Write-Host ""
        Write-Host "🎥 Setting up for local camera testing..." -ForegroundColor Yellow
        
        # Check if services are running
        Write-Host "Starting backend services..." -ForegroundColor Yellow
        docker-compose up -d postgres mediamtx
        
        Write-Host ""
        Write-Host "⏳ Waiting for services..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        
        # Start control plane in background
        Write-Host "Starting control plane..." -ForegroundColor Yellow
        Start-Process -FilePath "powershell" -ArgumentList "-Command", "cd '$PWD'; npm run dev"
        
        Start-Sleep -Seconds 5
        
        # Start media gateway in background
        Write-Host "Starting media gateway..." -ForegroundColor Yellow
        Start-Process -FilePath "powershell" -ArgumentList "-Command", "cd '$PWD'; npm run media:dev"
        
        Start-Sleep -Seconds 5
        
        # Start dashboard in background
        Write-Host "Starting dashboard..." -ForegroundColor Yellow
        Start-Process -FilePath "powershell" -ArgumentList "-Command", "cd '$PWD'; npm run dashboard:dev"
        
        Write-Host ""
        Write-Host "✅ Services started!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 Next steps:" -ForegroundColor Cyan
        Write-Host "1. Ensure your cameras have ONVIF enabled"
        Write-Host "2. Configure edge-agent/.env with camera credentials"
        Write-Host "3. Run: npm run edge:dev"
        Write-Host "4. Open http://localhost:3000 to view cameras"
        Write-Host ""
        Write-Host "See QUICK_START_2_CAMERAS.md for detailed instructions"
    }
    
    default {
        Write-Host "Invalid choice" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🎉 Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📚 Next steps:" -ForegroundColor Cyan
Write-Host "1. Configure edge agents at each branch (see edge-agent/.env.example)"
Write-Host "2. Set up monitoring and backups"
Write-Host "3. Review security checklist: CRITICAL_FIXES_CHECKLIST.md"
Write-Host ""
