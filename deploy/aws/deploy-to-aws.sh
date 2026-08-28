#!/usr/bin/env bash
# ==============================================================================
# Sentinel Grid (Om Systems) - AWS Interactive Deployment Assistant (Bash)
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}  🚀 Sentinel Grid (Om Systems) - AWS Deployment Center          ${NC}"
echo -e "${CYAN}=================================================================${NC}"

echo -e "\n${YELLOW}Checking local environment...${NC}"
HAS_AWS_CLI=false
HAS_DOCKER=false

if command -v aws &> /dev/null; then
    echo -e "${GREEN}✅ AWS CLI detected: $(aws --version)${NC}"
    HAS_AWS_CLI=true
else
    echo -e "${YELLOW}⚠️  AWS CLI is not installed in PATH.${NC}"
fi

if command -v docker &> /dev/null; then
    echo -e "${GREEN}✅ Docker detected: $(docker --version)${NC}"
    HAS_DOCKER=true
else
    echo -e "${YELLOW}⚠️  Docker is not running or not installed.${NC}"
fi

echo -e "\n${CYAN}Select your preferred AWS deployment mode:${NC}"
echo "1) 🌟 1-Click CloudFormation (EC2 + Auto-SSL + S3 Archive) [RECOMMENDED]"
echo "2) ⚡ AWS Lightsail (Fast, Fixed-Price VPS: $10 - $20/month)"
echo "3) 🏢 AWS ECS Fargate + RDS + ElastiCache (Enterprise Serverless)"
echo "4) 📦 Build & Push Images to Amazon ECR"
echo "5) 🔑 Generate Secure AWS .env Credentials"
echo "6) 📖 View Step-by-Step AWS Console Manual Guide"
echo "Q) Quit"
echo ""

read -rp "Enter your choice [1-6, Q]: " CHOICE

case "$CHOICE" in
    1)
        echo -e "\n${CYAN}🌟 Option 1: 1-Click AWS CloudFormation EC2 Deployment${NC}"
        if [ "$HAS_AWS_CLI" = false ]; then
            echo -e "${RED}❌ AWS CLI is required to deploy automatically from the terminal.${NC}"
            echo -e "${YELLOW}Alternative: Open AWS CloudFormation Console -> Create Stack -> Upload '$SCRIPT_DIR/cloudformation-ec2-stack.yaml'${NC}"
            exit 1
        fi

        read -rp "Enter CloudFormation Stack Name [sentinel-grid-prod]: " STACK_NAME
        STACK_NAME=${STACK_NAME:-sentinel-grid-prod}

        read -rp "Enter AWS Region [ap-south-1]: " REGION
        REGION=${REGION:-ap-south-1}

        read -rp "Enter EC2 Instance Type (t3.large, t3.xlarge, c6i.xlarge) [t3.xlarge]: " INSTANCE_TYPE
        INSTANCE_TYPE=${INSTANCE_TYPE:-t3.xlarge}

        read -rp "Enter existing EC2 KeyPair name (leave blank to use AWS SSM Session Manager): " KEY_PAIR
        read -rp "Enter domain name for automatic SSL (e.g. cctv.yourcompany.com, or leave blank): " DOMAIN_NAME

        PARAMS="ParameterKey=InstanceType,ParameterValue=$INSTANCE_TYPE"
        if [ -n "$KEY_PAIR" ]; then
            PARAMS="$PARAMS ParameterKey=KeyName,ParameterValue=$KEY_PAIR"
        fi
        if [ -n "$DOMAIN_NAME" ]; then
            PARAMS="$PARAMS ParameterKey=DomainName,ParameterValue=$DOMAIN_NAME"
        fi

        echo -e "\n${CYAN}Deploying stack '$STACK_NAME' in region '$REGION'...${NC}"
        aws cloudformation create-stack \
            --stack-name "$STACK_NAME" \
            --template-body "file://$SCRIPT_DIR/cloudformation-ec2-stack.yaml" \
            --capabilities CAPABILITY_IAM \
            --region "$REGION" \
            --parameters $PARAMS

        echo -e "\n${GREEN}✅ CloudFormation Stack creation initiated!${NC}"
        echo -e "Monitor progress in AWS Console or run:"
        echo -e "  aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION"
        ;;

    2)
        echo -e "\n${CYAN}⚡ Option 2: AWS Lightsail Quick Start${NC}"
        echo -e "${GREEN}AWS Lightsail is the easiest and most cost-effective way to host Sentinel Grid.${NC}"
        echo ""
        echo "1. Go to AWS Lightsail: https://lightsail.aws.amazon.com/"
        echo "2. Click 'Create instance' -> Linux/Unix -> OS Only (Amazon Linux 2023 or Ubuntu 24.04)"
        echo "3. Select Plan: 4GB or 8GB RAM ($20 or $40/month)"
        echo "4. Under 'Networking', attach a Static IP and open ports: 80, 443, 8080, 8554, 8888, 10000"
        echo "5. In 'Launch Script', paste contents of $SCRIPT_DIR/setup-ec2-instance.sh"
        ;;

    3)
        echo -e "\n${CYAN}🏢 Option 3: AWS ECS Fargate + RDS + ElastiCache (Enterprise)${NC}"
        if [ "$HAS_AWS_CLI" = false ]; then
            echo -e "${RED}❌ AWS CLI is required to deploy ECS CloudFormation automatically.${NC}"
            exit 1
        fi

        read -rp "Enter ECS Stack Name [sentinel-ecs-prod]: " STACK_NAME
        STACK_NAME=${STACK_NAME:-sentinel-ecs-prod}

        read -rp "Enter AWS Region [ap-south-1]: " REGION
        REGION=${REGION:-ap-south-1}

        read -rsp "Enter Master Password for RDS PostgreSQL (min 8 chars): " DB_PASS
        echo ""

        aws cloudformation create-stack \
            --stack-name "$STACK_NAME" \
            --template-body "file://$SCRIPT_DIR/cloudformation-ecs-fargate.yaml" \
            --capabilities CAPABILITY_IAM \
            --region "$REGION" \
            --parameters ParameterKey=DBMasterPassword,ParameterValue="$DB_PASS"

        echo -e "\n${GREEN}✅ Enterprise ECS CloudFormation Stack creation initiated!${NC}"
        ;;

    4)
        echo -e "\n${CYAN}📦 Option 4: Build & Push Images to Amazon ECR${NC}"
        read -rp "Enter your 12-digit AWS Account ID: " ACCOUNT_ID
        read -rp "Enter AWS Region [ap-south-1]: " REGION
        REGION=${REGION:-ap-south-1}

        REGISTRY="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
        aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

        docker compose -f "$SCRIPT_DIR/docker-compose.aws.yml" build
        echo -e "${GREEN}✅ Images built successfully.${NC}"
        ;;

    5)
        echo -e "\n${CYAN}🔑 Option 5: Generating Production Secrets & .env File...${NC}"
        ENV_FILE="$ROOT_DIR/.env.production.aws"
        cat <<EOF > "$ENV_FILE"
# Sentinel Grid AWS Production Environment Secrets
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DB_PASSWORD=$(openssl rand -hex 20)
REDIS_PASSWORD=$(openssl rand -hex 20)
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
MEDIA_GATEWAY_SHARED_KEY=$(openssl rand -hex 24)
RECORDING_ENGINE_SHARED_KEY=$(openssl rand -hex 24)
ANALYTICS_ENGINE_SHARED_KEY=$(openssl rand -hex 24)
ANALYTICS_SOURCE_SHARED_KEY=$(openssl rand -hex 24)
REPORT_DOWNLOAD_SECRET=$(openssl rand -hex 24)
AWS_REGION=ap-south-1
DOMAIN_NAME=
ADMIN_EMAIL=admin@example.com
EOF
        echo -e "${GREEN}✅ Generated secure credentials file: $ENV_FILE${NC}"
        ;;

    6)
        echo -e "\n${CYAN}📖 Option 6: Step-by-Step AWS Console Manual Guide${NC}"
        echo -e "Read full guide at: ${GREEN}$SCRIPT_DIR/AWS_DEPLOYMENT_GUIDE.md${NC}"
        ;;

    *)
        echo "Exiting."
        ;;
esac
