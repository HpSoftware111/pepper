# AWS Lambda Functions for Pepper 2.0

This directory contains AWS Lambda handlers for scheduled jobs that previously ran via node-cron on EC2.

---

## Functions

### 1. `caseCleanupHandler.js`
**Purpose:** Clean up closed cases after retention period  
**Schedule:** Daily at 2:00 AM (America/New_York)  
**Source:** `services/caseCleanupService.js`

### 2. `calendarNotificationHandler.js`
**Purpose:** Send WhatsApp notifications for upcoming calendar events  
**Schedule:** Every 5 minutes (America/New_York)  
**Source:** `services/calendarNotificationService.js`

### 3. `cpnuSyncHandler.js`
**Purpose:** Sync CPNU actuaciones for linked cases  
**Schedule:** 12:00 PM and 7:00 PM daily (America/Bogota)  
**Source:** `services/cpnuAutoSyncService.js`

---

## Deployment

### Prerequisites
- AWS CLI configured
- Node.js 20.x installed locally
- Dependencies installed (`npm install`)

### Build & Package

```bash
# Package each function
cd backend/lambda
./package-function.sh caseCleanupHandler
./package-function.sh calendarNotificationHandler
./package-function.sh cpnuSyncHandler
```

### Deploy via AWS CLI

```bash
# Create function
aws lambda create-function \
  --function-name pepper-20-case-cleanup \
  --runtime nodejs20.x \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --handler lambda/caseCleanupHandler.handler \
  --zip-file fileb://caseCleanupHandler.zip \
  --timeout 300 \
  --memory-size 512 \
  --environment Variables="{MONGO_URI=...,TZ=America/New_York}"

# Update function code
aws lambda update-function-code \
  --function-name pepper-20-case-cleanup \
  --zip-file fileb://caseCleanupHandler.zip
```

---

## Local Testing

```bash
# Test Lambda locally (simulates EventBridge event)
node -e "require('./lambda/caseCleanupHandler.js').handler({}, {}, console.log)"
```

---

## EventBridge Configuration

See `AWS_OPERATIONAL_RUNBOOK.md` for EventBridge schedule configuration.

---

## Notes

- Lambda functions share the same codebase as EC2 (imported services)
- MongoDB connection is reused from `lib/mongo.js`
- Environment variables should be set in AWS Lambda Console or Parameter Store
- Each function is packaged with dependencies (`node_modules`)
