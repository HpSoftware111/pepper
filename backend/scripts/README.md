# Backend Scripts

This directory contains utility scripts for managing the Pepper 2.0 backend.

## Scripts

### `disable-ec2-cron.sh`

**Purpose:** Disable all EC2 cron jobs after migrating to AWS Lambda

**Usage:**
```bash
# On EC2
./disable-ec2-cron.sh

# From local machine
ssh user@ec2-instance "bash -s" < disable-ec2-cron.sh
```

**What it does:**
- Backs up current `.env` file
- Sets environment variables to disable all cron jobs
- Restarts PM2 to apply changes
- Verifies the changes

### `verify-cron-disabled.sh`

**Purpose:** Verify that all EC2 cron jobs are disabled

**Usage:**
```bash
# On EC2
./verify-cron-disabled.sh

# From local machine
ssh user@ec2-instance "bash -s" < verify-cron-disabled.sh
```

**What it checks:**
- Environment variables in `.env` file
- PM2 logs for disable messages
- No active scheduled tasks

## Documentation

See `CRON_MIGRATION_GUIDE.md` for complete migration instructions.

## Making Scripts Executable

If scripts are not executable:

```bash
chmod +x disable-ec2-cron.sh
chmod +x verify-cron-disabled.sh
```
