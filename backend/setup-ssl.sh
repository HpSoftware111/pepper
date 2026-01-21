#!/bin/bash

# SSL Certificate Setup Script for Pepper 2.0
# Run this script to install Let's Encrypt SSL certificate
# Usage: sudo bash setup-ssl.sh <domain>
# Example: sudo bash setup-ssl.sh api.pepper.yourdomain.com

set -e

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash setup-ssl.sh <domain>"
  echo "Example: sudo bash setup-ssl.sh api.pepper.yourdomain.com"
  exit 1
fi

echo "🔒 Setting up SSL certificate for domain: $DOMAIN"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root or with sudo${NC}"
  exit 1
fi

# Check if Certbot is installed
if ! command -v certbot &> /dev/null; then
  echo -e "${YELLOW}Certbot not found. Installing...${NC}"
  apt update
  apt install -y certbot python3-certbot-nginx
fi

# Check DNS resolution
echo -e "${YELLOW}🔍 Checking DNS resolution...${NC}"
if dig +short $DOMAIN | grep -q .; then
  echo -e "${GREEN}✅ DNS resolves correctly${NC}"
else
  echo -e "${RED}❌ DNS does not resolve. Please configure DNS first.${NC}"
  echo "   Point $DOMAIN to this server's IP address"
  exit 1
fi

# Check if Nginx is configured
if [ ! -f /etc/nginx/sites-available/pepper-2.0 ]; then
  echo -e "${RED}❌ Nginx configuration not found. Run setup-nginx.sh first.${NC}"
  exit 1
fi

# Obtain SSL certificate
echo -e "${GREEN}📜 Obtaining SSL certificate from Let's Encrypt...${NC}"
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN --redirect

# Test certificate renewal
echo -e "${GREEN}🧪 Testing certificate renewal...${NC}"
certbot renew --dry-run

# Check auto-renewal
echo -e "${GREEN}⏰ Checking auto-renewal configuration...${NC}"
systemctl status certbot.timer

echo ""
echo -e "${GREEN}✅ SSL certificate installed successfully!${NC}"
echo ""
echo -e "${YELLOW}Certificate details:${NC}"
certbot certificates

echo ""
echo -e "${YELLOW}Test your HTTPS endpoint:${NC}"
echo "curl https://$DOMAIN/health"
echo ""
echo -e "${YELLOW}Certificate will auto-renew. Check status:${NC}"
echo "sudo systemctl status certbot.timer"
