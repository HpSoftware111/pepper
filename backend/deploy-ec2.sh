#!/bin/bash

# Pepper 2.0 EC2 Deployment Script
# Run this script to deploy updates to EC2
# Usage: bash deploy-ec2.sh [EC2_IP] [SSH_KEY]

set -e

EC2_IP=$1
SSH_KEY=$2

if [ -z "$EC2_IP" ] || [ -z "$SSH_KEY" ]; then
  echo "Usage: bash deploy-ec2.sh <EC2_IP> <SSH_KEY_PATH>"
  echo "Example: bash deploy-ec2.sh 54.123.45.67 ~/.ssh/pepper-key.pem"
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "Error: SSH key file not found: $SSH_KEY"
  exit 1
fi

echo "🚀 Deploying Pepper 2.0 to EC2..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test SSH connection
echo -e "${YELLOW}Testing SSH connection...${NC}"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ubuntu@$EC2_IP "echo 'SSH connection successful'"

# Backup current deployment
echo -e "${YELLOW}Creating backup...${NC}"
ssh -i "$SSH_KEY" ubuntu@$EC2_IP "cd /opt/pepper-2.0/backend && tar -czf ~/backup-\$(date +%Y%m%d-%H%M%S).tar.gz ."

# Stop PM2 process
echo -e "${YELLOW}Stopping application...${NC}"
ssh -i "$SSH_KEY" ubuntu@$EC2_IP "pm2 stop pepper-2.0-backend || true"

# Sync files (exclude node_modules, .git, etc.)
echo -e "${YELLOW}Syncing files...${NC}"
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'cases' \
  --exclude '*.log' \
  --exclude '.env' \
  -e "ssh -i $SSH_KEY" \
  ./ ubuntu@$EC2_IP:/opt/pepper-2.0/backend/

# Install/update dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
ssh -i "$SSH_KEY" ubuntu@$EC2_IP "cd /opt/pepper-2.0/backend && npm install --production"

# Restart PM2 process
echo -e "${YELLOW}Restarting application...${NC}"
ssh -i "$SSH_KEY" ubuntu@$EC2_IP "cd /opt/pepper-2.0/backend && pm2 restart pepper-2.0-backend"

# Wait a moment for startup
sleep 3

# Check health
echo -e "${YELLOW}Checking health endpoint...${NC}"
HEALTH=$(ssh -i "$SSH_KEY" ubuntu@$EC2_IP "curl -s http://localhost:3001/health || echo 'FAILED'")

if [[ $HEALTH == *"OK"* ]]; then
  echo -e "${GREEN}✅ Deployment successful!${NC}"
  echo -e "${GREEN}Health check: $HEALTH${NC}"
else
  echo -e "${YELLOW}⚠️  Health check failed. Check logs:${NC}"
  echo "ssh -i $SSH_KEY ubuntu@$EC2_IP 'pm2 logs pepper-2.0-backend --lines 50'"
fi

echo ""
echo -e "${YELLOW}View logs:${NC}"
echo "ssh -i $SSH_KEY ubuntu@$EC2_IP 'pm2 logs pepper-2.0-backend'"
