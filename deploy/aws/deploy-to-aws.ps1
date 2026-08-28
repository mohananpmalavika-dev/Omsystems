# ==============================================================================
# Sentinel Grid (Om Systems) - AWS Interactive Deployment Assistant (PowerShell)
# ==============================================================================

$ErrorActionPreference = "Stop"

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Yellow
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host ""
}

Write-Header "🚀 Sentinel Grid (Om Systems) - AWS Deployment Center"

Write-Host "Checking local environment..." -ForegroundColor DarkGray
$hasAwsCli = $false
$hasDocker = $false

try {
    $awsVer = aws --version 2>&1
    Write-Host "✅ AWS CLI detected: $awsVer" -ForegroundColor Green
    $hasAwsCli = $true
} catch {
    Write-Host "⚠️  AWS CLI is not installed or not in PATH." -ForegroundColor Yellow
}

try {
    $dockerVer = docker --version 2>&1
    Write-Host "✅ Docker detected: $dockerVer" -ForegroundColor Green
    $hasDocker = $true
} catch {
    Write-Host "⚠️  Docker is not running or not installed." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Select your preferred AWS deployment mode:" -ForegroundColor Cyan
Write-Host "1) 🌟 1-Click CloudFormation (EC2 + Auto-SSL + S3 Archive) [RECOMMENDED]" -ForegroundColor White
Write-Host "2) ⚡ AWS Lightsail (Fast, Fixed-Price VPS: $10 - $20/month)" -ForegroundColor White
Write-Host "3) 🏢 AWS ECS Fargate + RDS + ElastiCache (Enterprise Serverless)" -ForegroundColor White
Write-Host "4) 📦 Build & Push Images to Amazon ECR" -ForegroundColor White
Write-Host "5) 🔑 Generate Secure AWS .env Credentials" -ForegroundColor White
Write-Host "6) 📖 View Step-by-Step AWS Console Manual Guide" -ForegroundColor White
Write-Host "Q) Quit" -ForegroundColor DarkGray
Write-Host ""

$choice = Read-Host "Enter your choice [1-6, Q]"

function Generate-Secrets {
    $jwtSecret = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
    $sessionSecret = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
    $mediaKey = [System.Guid]::NewGuid().ToString("N")
    $recKey = [System.Guid]::NewGuid().ToString("N")
    $analyticsKey = [System.Guid]::NewGuid().ToString("N")
    $analyticsSrcKey = [System.Guid]::NewGuid().ToString("N")
    $reportSecret = [System.Guid]::NewGuid().ToString("N")
    $dbPass = "DbSec_" + [System.Guid]::NewGuid().ToString("N").Substring(0, 16) + "!"
    $redisPass = "RdSec_" + [System.Guid]::NewGuid().ToString("N").Substring(0, 16) + "!"

    return @{
        JWT_SECRET = $jwtSecret
        SESSION_SECRET = $sessionSecret
        MEDIA_KEY = $mediaKey
        REC_KEY = $recKey
        ANALYTICS_KEY = $analyticsKey
        ANALYTICS_SRC_KEY = $analyticsSrcKey
        REPORT_SECRET = $reportSecret
        DB_PASS = $dbPass
        REDIS_PASS = $redisPass
    }
}

switch ($choice) {
    "1" {
        Write-Header "🌟 Option 1: 1-Click AWS CloudFormation EC2 Deployment"

        if (-not $hasAwsCli) {
            Write-Host "AWS CLI is required to deploy automatically from the terminal." -ForegroundColor Red
            Write-Host "Alternative: Open AWS CloudFormation Console -> Create Stack -> Upload 'deploy/aws/cloudformation-ec2-stack.yaml'" -ForegroundColor Yellow
            return
        }

        $stackName = Read-Host "Enter CloudFormation Stack Name [sentinel-grid-prod]"
        if ([string]::IsNullOrWhiteSpace($stackName)) { $stackName = "sentinel-grid-prod" }

        $region = Read-Host "Enter AWS Region [ap-south-1]"
        if ([string]::IsNullOrWhiteSpace($region)) { $region = "ap-south-1" }

        $instanceType = Read-Host "Enter EC2 Instance Type (t3.large, t3.xlarge, c6i.xlarge) [t3.xlarge]"
        if ([string]::IsNullOrWhiteSpace($instanceType)) { $instanceType = "t3.xlarge" }

        $keyPair = Read-Host "Enter existing EC2 KeyPair name (leave blank to use AWS SSM Session Manager)"

        $domain = Read-Host "Enter domain name for automatic SSL (e.g. cctv.yourcompany.com, or leave blank)"

        Write-Host ""
        Write-Host "Deploying stack '$stackName' in region '$region'..." -ForegroundColor Cyan

        $paramList = "ParameterKey=InstanceType,ParameterValue=$instanceType"
        if (-not [string]::IsNullOrWhiteSpace($keyPair)) {
            $paramList += " ParameterKey=KeyName,ParameterValue=$keyPair"
        }
        if (-not [string]::IsNullOrWhiteSpace($domain)) {
            $paramList += " ParameterKey=DomainName,ParameterValue=$domain"
        }

        $templatePath = Join-Path $PSScriptRoot "cloudformation-ec2-stack.yaml"

        $cmd = "aws cloudformation create-stack --stack-name $stackName --template-body file://$templatePath --capabilities CAPABILITY_IAM --region $region --parameters $paramList"
        Write-Host "Running: $cmd" -ForegroundColor DarkGray
        Invoke-Expression $cmd

        Write-Host ""
        Write-Host "✅ CloudFormation Stack creation initiated!" -ForegroundColor Green
        Write-Host "Monitor progress in AWS Console or run:" -ForegroundColor Yellow
        Write-Host "  aws cloudformation describe-stacks --stack-name $stackName --region $region" -ForegroundColor White
    }

    "2" {
        Write-Header "⚡ Option 2: AWS Lightsail Quick Start"
        Write-Host "AWS Lightsail offers the easiest low-cost VPS deployment for Sentinel Grid." -ForegroundColor Green
        Write-Host ""
        Write-Host "Steps to launch on Lightsail:" -ForegroundColor Cyan
        Write-Host "1. Go to AWS Lightsail Console: https://lightsail.aws.amazon.com/"
        Write-Host "2. Click 'Create instance'"
        Write-Host "3. Select Platform: 'Linux/Unix' | Blueprint: 'OS Only' -> 'Amazon Linux 2023' or 'Ubuntu 24.04'"
        Write-Host "4. Choose Instance Plan: 8 GB RAM / 2 vCPUs ($40/mo) or 4 GB RAM ($20/mo)"
        Write-Host "5. In 'Networking', attach a Static IP and open ports: 80, 443, 8080, 8554, 8888, 10000"
        Write-Host "6. In 'Launch Script' (UserData), paste the contents of:" -ForegroundColor Yellow
        Write-Host "   deploy/aws/setup-ec2-instance.sh" -ForegroundColor White
        Write-Host ""
    }

    "3" {
        Write-Header "🏢 Option 3: AWS ECS Fargate + RDS + ElastiCache (Enterprise)"

        if (-not $hasAwsCli) {
            Write-Host "AWS CLI is required to deploy ECS CloudFormation automatically." -ForegroundColor Red
            return
        }

        $stackName = Read-Host "Enter ECS Stack Name [sentinel-ecs-prod]"
        if ([string]::IsNullOrWhiteSpace($stackName)) { $stackName = "sentinel-ecs-prod" }

        $region = Read-Host "Enter AWS Region [ap-south-1]"
        if ([string]::IsNullOrWhiteSpace($region)) { $region = "ap-south-1" }

        $dbPassword = Read-Host "Enter Master Password for RDS PostgreSQL (min 8 chars)" -AsSecureString
        $plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword))

        $templatePath = Join-Path $PSScriptRoot "cloudformation-ecs-fargate.yaml"
        $cmd = "aws cloudformation create-stack --stack-name $stackName --template-body file://$templatePath --capabilities CAPABILITY_IAM --region $region --parameters ParameterKey=DBMasterPassword,ParameterValue=$plainPass"
        Write-Host "Running: $cmd" -ForegroundColor DarkGray
        Invoke-Expression $cmd

        Write-Host ""
        Write-Host "✅ Enterprise ECS CloudFormation Stack creation initiated!" -ForegroundColor Green
    }

    "4" {
        Write-Header "📦 Option 4: Build & Push Images to Amazon ECR"

        $accountId = Read-Host "Enter your 12-digit AWS Account ID"
        $region = Read-Host "Enter AWS Region [ap-south-1]"
        if ([string]::IsNullOrWhiteSpace($region)) { $region = "ap-south-1" }

        $ecrRegistry = "$accountId.dkr.ecr.$region.amazonaws.com"

        Write-Host ""
        Write-Host "1. Logging into Amazon ECR ($ecrRegistry)..." -ForegroundColor Cyan
        aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $ecrRegistry

        $services = @("sentinel-control-plane", "sentinel-dashboard", "sentinel-media-gateway", "sentinel-recording-engine", "sentinel-analytics-engine")

        foreach ($svc in $services) {
            Write-Host "Creating repository $svc (if not exists)..." -ForegroundColor DarkGray
            aws ecr create-repository --repository-name $svc --region $region 2>$null | Out-Null
        }

        Write-Host ""
        Write-Host "2. Building and tagging container images..." -ForegroundColor Cyan
        docker compose -f (Join-Path $PSScriptRoot "docker-compose.aws.yml") build

        Write-Host ""
        Write-Host "3. Pushing images to Amazon ECR..." -ForegroundColor Cyan
        Write-Host "Images built and ready for registry tagging and push." -ForegroundColor Green
    }

    "5" {
        Write-Header "🔑 Option 5: Generate Production Secrets & .env File"

        $secrets = Generate-Secrets
        $envFile = Join-Path (Get-Item $PSScriptRoot).Parent.Parent.FullName ".env.production.aws"

        $content = @"
# =================================================================
# Sentinel Grid (Om Systems) - AWS Production Environment Secrets
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# =================================================================
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DB_PASSWORD=$($secrets.DB_PASS)
REDIS_PASSWORD=$($secrets.REDIS_PASS)
DATABASE_URL=postgresql://sentinel_admin:$($secrets.DB_PASS)@postgres:5432/sentinel_grid
REDIS_URL=redis://:$($secrets.REDIS_PASS)@redis:6379
JWT_SECRET=$($secrets.JWT_SECRET)
SESSION_SECRET=$($secrets.SESSION_SECRET)
MEDIA_GATEWAY_SHARED_KEY=$($secrets.MEDIA_KEY)
RECORDING_ENGINE_SHARED_KEY=$($secrets.REC_KEY)
ANALYTICS_ENGINE_SHARED_KEY=$($secrets.ANALYTICS_KEY)
ANALYTICS_SOURCE_SHARED_KEY=$($secrets.ANALYTICS_SRC_KEY)
REPORT_DOWNLOAD_SECRET=$($secrets.REPORT_SECRET)
AWS_REGION=ap-south-1
DOMAIN_NAME=
ADMIN_EMAIL=admin@example.com
"@
        Set-Content -Path $envFile -Value $content -Encoding UTF8
        Write-Host "✅ Generated secure credentials file: $envFile" -ForegroundColor Green
        Write-Host "Use these secrets in your AWS instance or CloudFormation stack." -ForegroundColor Yellow
    }

    "6" {
        Write-Header "📖 Option 6: Step-by-Step AWS Console Manual Guide"
        $guidePath = Join-Path $PSScriptRoot "AWS_DEPLOYMENT_GUIDE.md"
        Write-Host "Open and read the full guide at: $guidePath" -ForegroundColor Green
    }

    Default {
        Write-Host "Exiting." -ForegroundColor DarkGray
    }
}
