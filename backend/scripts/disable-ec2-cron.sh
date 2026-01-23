#!/bin/bash
#
# Migration Script: Disable EC2 Cron Jobs
#
# Purpose: Disable all node-cron scheduled tasks on EC2 after migrating to AWS Lambda
# 
# This script:
# 1. Backs up the current .env file
# 2. Adds/updates environment variables to disable all cron jobs
# 3. Restarts PM2 to apply changes
# 4. Verifies the changes
#
# Usage:
#   ./disable-ec2-cron.sh
#   OR
#   ssh user@ec2-instance "bash -s" < disable-ec2-cron.sh
#

set -e  # Exit on error

# Configuration
ENV_FILE="/opt/pepper-2.0/backend/.env"
BACKUP_DIR="/opt/pepper-2.0/backend/.env-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/.env.backup_${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Disable EC2 Cron Jobs Migration${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Error: .env file not found at $ENV_FILE${NC}"
    echo "Please ensure the backend is deployed to EC2."
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Backup current .env file
echo -e "${YELLOW}📦 Creating backup of .env file...${NC}"
cp "$ENV_FILE" "$BACKUP_FILE"
echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"
echo ""

# Function to add or update environment variable
add_or_update_env() {
    local key=$1
    local value=$2
    local file=$3
    
    # Check if variable already exists
    if grep -q "^${key}=" "$file"; then
        # Update existing variable
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
        else
            # Linux
            sed -i "s|^${key}=.*|${key}=${value}|" "$file"
        fi
        echo -e "  ${GREEN}✓${NC} Updated: ${key}=${value}"
    else
        # Add new variable at the end
        echo "" >> "$file"
        echo "# Disabled EC2 cron (migrated to Lambda)" >> "$file"
        echo "${key}=${value}" >> "$file"
        echo -e "  ${GREEN}✓${NC} Added: ${key}=${value}"
    fi
}

# Disable all cron jobs
echo -e "${YELLOW}🔧 Disabling EC2 cron jobs...${NC}"

# Disable Case Cleanup
add_or_update_env "ENABLE_AUTO_CLEANUP" "false" "$ENV_FILE"
add_or_update_env "CASE_CLEANUP_SCHEDULE" "disabled" "$ENV_FILE"

# Disable Calendar Notifications
add_or_update_env "ENABLE_CALENDAR_NOTIFICATIONS" "false" "$ENV_FILE"
add_or_update_env "CALENDAR_NOTIFICATION_SCHEDULE" "disabled" "$ENV_FILE"

# Disable CPNU Sync
add_or_update_env "CPNU_SYNC_ENABLED" "false" "$ENV_FILE"

echo ""
echo -e "${GREEN}✅ All cron jobs disabled in .env file${NC}"
echo ""

# Show what was changed
echo -e "${BLUE}📋 Summary of changes:${NC}"
echo "  • ENABLE_AUTO_CLEANUP=false"
echo "  • CASE_CLEANUP_SCHEDULE=disabled"
echo "  • ENABLE_CALENDAR_NOTIFICATIONS=false"
echo "  • CALENDAR_NOTIFICATION_SCHEDULE=disabled"
echo "  • CPNU_SYNC_ENABLED=false"
echo ""

# Restart PM2 to apply changes
echo -e "${YELLOW}🔄 Restarting PM2 backend to apply changes...${NC}"
cd /opt/pepper-2.0/backend || exit 1

# Check if PM2 process exists
if pm2 list | grep -q "pepper-2.0-backend"; then
    pm2 restart pepper-2.0-backend
    echo -e "${GREEN}✅ PM2 backend restarted${NC}"
else
    echo -e "${YELLOW}⚠️  PM2 process 'pepper-2.0-backend' not found${NC}"
    echo "  Starting backend with PM2..."
    pm2 start ecosystem.config.cjs
    pm2 save
    echo -e "${GREEN}✅ PM2 backend started${NC}"
fi

echo ""

# Wait a moment for PM2 to start
sleep 3

# Verify PM2 status
echo -e "${BLUE}📊 PM2 Status:${NC}"
pm2 status

echo ""

# Show PM2 logs (last 20 lines) to verify cron is disabled
echo -e "${BLUE}📝 Recent PM2 logs (checking for cron disable messages):${NC}"
pm2 logs pepper-2.0-backend --lines 20 --nostream | grep -E "(Automatic|Calendar|CPNU|disabled|Lambda)" || echo "  (No relevant log messages found)"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Migration Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}📌 Next Steps:${NC}"
echo "  1. Verify Lambda functions are deployed and working"
echo "  2. Check EventBridge rules are configured correctly"
echo "  3. Monitor Lambda CloudWatch logs for scheduled tasks"
echo "  4. Verify EC2 logs show cron jobs are disabled"
echo ""
echo -e "${BLUE}📦 Backup Location:${NC}"
echo "  $BACKUP_FILE"
echo ""
echo -e "${YELLOW}💡 To restore previous settings:${NC}"
echo "  cp $BACKUP_FILE $ENV_FILE"
echo "  pm2 restart pepper-2.0-backend"
echo ""
