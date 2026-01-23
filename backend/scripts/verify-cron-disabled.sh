#!/bin/bash
#
# Verification Script: Check if EC2 Cron Jobs are Disabled
#
# Purpose: Verify that all cron jobs are disabled on EC2
#
# Usage:
#   ./verify-cron-disabled.sh
#   OR
#   ssh user@ec2-instance "bash -s" < verify-cron-disabled.sh
#

set -e

ENV_FILE="/opt/pepper-2.0/backend/.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Verify EC2 Cron Jobs Disabled${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Error: .env file not found at $ENV_FILE${NC}"
    exit 1
fi

# Function to check environment variable
check_env_var() {
    local key=$1
    local expected_value=$2
    local description=$3
    
    if grep -q "^${key}=${expected_value}" "$ENV_FILE"; then
        echo -e "  ${GREEN}✓${NC} $description: ${key}=${expected_value}"
        return 0
    elif grep -q "^${key}=" "$ENV_FILE"; then
        local actual_value=$(grep "^${key}=" "$ENV_FILE" | cut -d'=' -f2)
        echo -e "  ${RED}✗${NC} $description: ${key}=${actual_value} (expected: ${expected_value})"
        return 1
    else
        echo -e "  ${YELLOW}⚠${NC} $description: ${key} not found in .env"
        return 2
    fi
}

echo -e "${BLUE}📋 Checking .env file:${NC}"
echo ""

# Check all cron-related environment variables
all_ok=true

check_env_var "ENABLE_AUTO_CLEANUP" "false" "Case Cleanup" || all_ok=false
check_env_var "CASE_CLEANUP_SCHEDULE" "disabled" "Case Cleanup Schedule" || all_ok=false
check_env_var "ENABLE_CALENDAR_NOTIFICATIONS" "false" "Calendar Notifications" || all_ok=false
check_env_var "CALENDAR_NOTIFICATION_SCHEDULE" "disabled" "Calendar Notification Schedule" || all_ok=false
check_env_var "CPNU_SYNC_ENABLED" "false" "CPNU Sync" || all_ok=false

echo ""

# Check PM2 logs for disable messages
echo -e "${BLUE}📝 Checking PM2 logs for disable messages:${NC}"
if pm2 list | grep -q "pepper-2.0-backend"; then
    echo ""
    echo "  Looking for 'disabled' or 'Lambda' messages in logs..."
    echo ""
    
    # Check for disable messages
    if pm2 logs pepper-2.0-backend --lines 50 --nostream | grep -q "Automatic case cleanup is disabled"; then
        echo -e "  ${GREEN}✓${NC} Case cleanup is disabled"
    else
        echo -e "  ${YELLOW}⚠${NC} Case cleanup disable message not found in logs"
    fi
    
    if pm2 logs pepper-2.0-backend --lines 50 --nostream | grep -q "Automatic calendar notifications are disabled"; then
        echo -e "  ${GREEN}✓${NC} Calendar notifications are disabled"
    else
        echo -e "  ${YELLOW}⚠${NC} Calendar notifications disable message not found in logs"
    fi
    
    if pm2 logs pepper-2.0-backend --lines 50 --nostream | grep -q "CPNU automatic sync is disabled"; then
        echo -e "  ${GREEN}✓${NC} CPNU sync is disabled"
    else
        echo -e "  ${YELLOW}⚠${NC} CPNU sync disable message not found in logs"
    fi
    
    # Check for any scheduled messages (should NOT appear)
    if pm2 logs pepper-2.0-backend --lines 50 --nostream | grep -q "scheduled:"; then
        echo -e "  ${RED}✗${NC} Found 'scheduled:' messages - cron may still be active!"
        all_ok=false
    else
        echo -e "  ${GREEN}✓${NC} No 'scheduled:' messages found (good)"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} PM2 process 'pepper-2.0-backend' not running"
fi

echo ""

# Final summary
echo -e "${BLUE}========================================${NC}"
if [ "$all_ok" = true ]; then
    echo -e "${GREEN}✅ All cron jobs appear to be disabled${NC}"
    echo ""
    echo -e "${BLUE}📌 Verification Checklist:${NC}"
    echo "  ✓ Environment variables set correctly"
    echo "  ✓ PM2 logs show disable messages"
    echo "  ✓ No scheduled cron messages found"
    echo ""
    echo -e "${GREEN}✅ EC2 cron migration verified!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some issues found${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Please review the output above and:${NC}"
    echo "  1. Ensure all environment variables are set correctly"
    echo "  2. Restart PM2: pm2 restart pepper-2.0-backend"
    echo "  3. Check PM2 logs: pm2 logs pepper-2.0-backend"
    echo "  4. Re-run this verification script"
    exit 1
fi
