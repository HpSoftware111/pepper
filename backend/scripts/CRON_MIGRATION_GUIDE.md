# EC2 Cron Migration Guide

## Overview

This guide helps you disable all `node-cron` scheduled tasks on EC2 after migrating to AWS Lambda functions managed by EventBridge.

---

## Prerequisites

1. ✅ **Lambda functions deployed** and working correctly
2. ✅ **EventBridge rules configured** for all scheduled tasks
3. ✅ **Lambda functions tested** and verified working
4. ✅ **Backup plan** in place (scripts create automatic backups)

---

## Migration Steps

### Step 1: Verify Lambda Functions are Working

Before disabling EC2 cron, ensure Lambda functions are deployed and working:

```bash
# Check Lambda functions exist
aws lambda list-functions --query "Functions[?contains(FunctionName, 'pepper-2.0')].FunctionName"

# Test a Lambda function manually
aws lambda invoke \
  --function-name pepper-2.0-case-cleanup \
  --payload '{}' \
  response.json

# Check EventBridge rules
aws events list-rules --name-prefix pepper-2.0
```

### Step 2: Run Migration Script

**Option A: Run directly on EC2**

```bash
# SSH into EC2
ssh user@your-ec2-instance

# Navigate to scripts directory
cd /opt/pepper-2.0/backend/scripts

# Make script executable
chmod +x disable-ec2-cron.sh

# Run migration
./disable-ec2-cron.sh
```

**Option B: Run from local machine via SSH**

```bash
# From your local machine
ssh user@your-ec2-instance "bash -s" < backend/scripts/disable-ec2-cron.sh
```

**Option C: Run via GitHub Actions (recommended)**

Add to your deployment workflow after Lambda deployment:

```yaml
- name: Disable EC2 Cron Jobs
  run: |
    ssh ${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }} "bash -s" < backend/scripts/disable-ec2-cron.sh
```

### Step 3: Verify Migration

Run the verification script:

```bash
# On EC2
./verify-cron-disabled.sh

# Or from local machine
ssh user@your-ec2-instance "bash -s" < backend/scripts/verify-cron-disabled.sh
```

Expected output:
- ✅ All environment variables set to `false` or `disabled`
- ✅ PM2 logs show "disabled" messages
- ✅ No "scheduled:" messages in logs

### Step 4: Monitor Lambda Functions

After migration, monitor Lambda execution:

```bash
# Watch Lambda logs
aws logs tail /aws/lambda/pepper-2.0-case-cleanup --follow
aws logs tail /aws/lambda/pepper-2.0-calendar-notifications --follow
aws logs tail /aws/lambda/pepper-2.0-cpnu-sync --follow
```

---

## What Gets Disabled

The migration script disables these scheduled tasks:

| Task | Environment Variable | Lambda Function |
|------|---------------------|-----------------|
| **Case Cleanup** | `ENABLE_AUTO_CLEANUP=false`<br>`CASE_CLEANUP_SCHEDULE=disabled` | `pepper-2.0-case-cleanup` |
| **Calendar Notifications** | `ENABLE_CALENDAR_NOTIFICATIONS=false`<br>`CALENDAR_NOTIFICATION_SCHEDULE=disabled` | `pepper-2.0-calendar-notifications` |
| **CPNU Sync** | `CPNU_SYNC_ENABLED=false` | `pepper-2.0-cpnu-sync` |

---

## Rollback Plan

If you need to re-enable EC2 cron jobs:

### Option 1: Restore from Backup

```bash
# List backups
ls -la /opt/pepper-2.0/backend/.env-backups/

# Restore specific backup
cp /opt/pepper-2.0/backend/.env-backups/.env.backup_20250123_120000 /opt/pepper-2.0/backend/.env

# Restart PM2
pm2 restart pepper-2.0-backend
```

### Option 2: Manual Re-enable

Edit `/opt/pepper-2.0/backend/.env`:

```bash
# Remove or comment out these lines:
# ENABLE_AUTO_CLEANUP=false
# CASE_CLEANUP_SCHEDULE=disabled
# ENABLE_CALENDAR_NOTIFICATIONS=false
# CALENDAR_NOTIFICATION_SCHEDULE=disabled
# CPNU_SYNC_ENABLED=false

# Or set to enable:
ENABLE_AUTO_CLEANUP=true
CASE_CLEANUP_SCHEDULE="0 2 * * *"
ENABLE_CALENDAR_NOTIFICATIONS=true
CALENDAR_NOTIFICATION_SCHEDULE="*/5 * * * *"
CPNU_SYNC_ENABLED=true

# Restart PM2
pm2 restart pepper-2.0-backend
```

---

## Verification Checklist

After migration, verify:

- [ ] ✅ Lambda functions deployed and accessible
- [ ] ✅ EventBridge rules configured and enabled
- [ ] ✅ EC2 `.env` file updated with disable flags
- [ ] ✅ PM2 restarted and logs show "disabled" messages
- [ ] ✅ No "scheduled:" messages in PM2 logs
- [ ] ✅ Lambda CloudWatch logs show successful executions
- [ ] ✅ Manual Lambda invocations work correctly
- [ ] ✅ EventBridge triggers Lambda functions on schedule

---

## Troubleshooting

### Issue: PM2 still shows scheduled tasks

**Solution:**
```bash
# Check PM2 logs
pm2 logs pepper-2.0-backend --lines 100

# Verify .env file
cat /opt/pepper-2.0/backend/.env | grep -E "(ENABLE|SCHEDULE|CPNU)"

# Restart PM2
pm2 restart pepper-2.0-backend
```

### Issue: Lambda functions not executing

**Solution:**
```bash
# Check EventBridge rules
aws events list-rules --name-prefix pepper-2.0

# Check Lambda permissions
aws lambda get-policy --function-name pepper-2.0-case-cleanup

# Test Lambda manually
aws lambda invoke --function-name pepper-2.0-case-cleanup --payload '{}' test.json
```

### Issue: Need to temporarily re-enable EC2 cron

**Solution:**
```bash
# Quick re-enable (temporary)
sed -i 's/ENABLE_AUTO_CLEANUP=false/ENABLE_AUTO_CLEANUP=true/' /opt/pepper-2.0/backend/.env
sed -i 's/CASE_CLEANUP_SCHEDULE=disabled/CASE_CLEANUP_SCHEDULE="0 2 * * *"/' /opt/pepper-2.0/backend/.env
pm2 restart pepper-2.0-backend
```

---

## Post-Migration Monitoring

### Week 1: Daily Checks

- Monitor Lambda CloudWatch logs daily
- Verify EventBridge rules are triggering
- Check for any duplicate executions (EC2 + Lambda)
- Monitor Lambda costs

### Week 2-4: Weekly Checks

- Review Lambda execution metrics
- Check for any errors or timeouts
- Verify all scheduled tasks are running correctly

### Ongoing: Monthly Reviews

- Review Lambda costs vs EC2 costs
- Optimize Lambda memory/timeout settings
- Review EventBridge rule schedules

---

## Expected Benefits

After migration:

✅ **No duplicate executions** (EC2 + Lambda)  
✅ **Better scalability** (Lambda auto-scales)  
✅ **Cost optimization** (pay per execution)  
✅ **Better monitoring** (CloudWatch metrics)  
✅ **Easier maintenance** (no EC2 cron management)  
✅ **Fault tolerance** (Lambda retries automatically)  

---

## Support

If you encounter issues:

1. Check this guide's troubleshooting section
2. Review Lambda CloudWatch logs
3. Check EventBridge rule status
4. Verify EC2 `.env` file settings
5. Review PM2 logs on EC2

---

## Scripts Reference

| Script | Purpose | Location |
|--------|---------|----------|
| `disable-ec2-cron.sh` | Disable all EC2 cron jobs | `backend/scripts/` |
| `verify-cron-disabled.sh` | Verify cron jobs are disabled | `backend/scripts/` |

---

**Last Updated:** 2025-01-23  
**Version:** 1.0
