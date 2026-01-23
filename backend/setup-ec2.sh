#!/bin/bash

# Pepper 2.0 EC2 Setup Script
# Run this script on a fresh Ubuntu 22.04 EC2 instance
# Usage: sudo bash setup-ec2.sh

set -e

echo "🚀 Starting Pepper 2.0 EC2 Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root or with sudo${NC}"
  exit 1
fi

# Update system
echo -e "${GREEN}📦 Updating system packages...${NC}"
apt update
apt upgrade -y

# Install essential tools
echo -e "${GREEN}📦 Installing essential tools...${NC}"
apt install -y curl wget git build-essential ufw

# Install Node.js 20.x
echo -e "${GREEN}📦 Installing Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo -e "${GREEN}✅ Node.js ${NODE_VERSION} installed${NC}"
echo -e "${GREEN}✅ npm ${NPM_VERSION} installed${NC}"

# Install PM2 globally
echo -e "${GREEN}📦 Installing PM2...${NC}"
npm install -g pm2
PM2_VERSION=$(pm2 --version)
echo -e "${GREEN}✅ PM2 ${PM2_VERSION} installed${NC}"

# Install Nginx
echo -e "${GREEN}📦 Installing Nginx...${NC}"
apt install -y nginx
systemctl enable nginx
echo -e "${GREEN}✅ Nginx installed${NC}"

# Create application directory
echo -e "${GREEN}📁 Creating application directory...${NC}"
mkdir -p /opt/pepper-2.0
chown ubuntu:ubuntu /opt/pepper-2.0

# Configure firewall
echo -e "${GREEN}🔥 Configuring firewall...${NC}"
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
echo -e "${GREEN}✅ Firewall configured${NC}"

# Create PM2 logs directory
echo -e "${GREEN}📁 Creating PM2 logs directory...${NC}"
mkdir -p /home/ubuntu/.pm2/logs
chown ubuntu:ubuntu /home/ubuntu/.pm2/logs

echo ""
echo -e "${GREEN}✅ EC2 setup complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Clone repository to /opt/pepper-2.0/backend"
echo "2. Create .env file with required variables"
echo "3. Run: cd /opt/pepper-2.0/backend && npm install --production"
echo "4. Run: pm2 start ecosystem.config.cjs"
echo "5. Run: pm2 startup systemd && pm2 save"
echo ""
echo -e "${YELLOW}See AWS_EC2_SETUP.md for detailed instructions${NC}"
