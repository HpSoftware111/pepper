#!/bin/bash

# Nginx Setup Script for Pepper 2.0
# Run this script to configure Nginx as reverse proxy
# Usage: sudo bash setup-nginx.sh <domain>
# Example: sudo bash setup-nginx.sh api.pepper.yourdomain.com

set -e

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash setup-nginx.sh <domain>"
  echo "Example: sudo bash setup-nginx.sh api.pepper.yourdomain.com"
  exit 1
fi

echo "🔧 Setting up Nginx for domain: $DOMAIN"

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

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
  echo -e "${YELLOW}Nginx not found. Installing...${NC}"
  apt update
  apt install -y nginx
fi

# Create Nginx configuration
echo -e "${GREEN}📝 Creating Nginx configuration...${NC}"
cat > /etc/nginx/sites-available/pepper-2.0 << EOF
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server (will be updated by Certbot)
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL will be configured by Certbot
    
    # Logging
    access_log /var/log/nginx/pepper-2.0-access.log;
    error_log /var/log/nginx/pepper-2.0-error.log;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Client body size
    client_max_body_size 50M;
    
    # Proxy settings
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        proxy_buffering off;
        proxy_request_buffering off;
    }
    
    location /health {
        proxy_pass http://localhost:3001/health;
        access_log off;
    }
}
EOF

# Enable site
echo -e "${GREEN}🔗 Enabling site...${NC}"
ln -sf /etc/nginx/sites-available/pepper-2.0 /etc/nginx/sites-enabled/

# Remove default site
if [ -f /etc/nginx/sites-enabled/default ]; then
  rm /etc/nginx/sites-enabled/default
fi

# Test configuration
echo -e "${GREEN}🧪 Testing Nginx configuration...${NC}"
if nginx -t; then
  echo -e "${GREEN}✅ Nginx configuration is valid${NC}"
else
  echo -e "${RED}❌ Nginx configuration has errors${NC}"
  exit 1
fi

# Reload Nginx
echo -e "${GREEN}🔄 Reloading Nginx...${NC}"
systemctl reload nginx

echo ""
echo -e "${GREEN}✅ Nginx configured successfully!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Configure DNS: Point $DOMAIN to this server's IP"
echo "2. Install SSL certificate: sudo certbot --nginx -d $DOMAIN"
echo "3. Test: curl https://$DOMAIN/health"
echo ""
echo -e "${YELLOW}Note: SSL certificate installation will update the configuration automatically${NC}"
