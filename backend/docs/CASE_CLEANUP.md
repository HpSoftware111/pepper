# Automatic Case Cleanup

## Overview

Pepper 2.0 automatically cleans up closed cases after a configurable retention period. This ensures that old case files don't accumulate indefinitely and helps maintain a clean file system.

## How It Works

1. **Case Lifecycle**: When a case is marked as `closed`, it enters a retention period
2. **Retention Period**: Closed cases are kept for a configurable number of days (default: 90 days)
3. **Automatic Cleanup**: A scheduled job runs daily to identify and delete cases that exceed the retention period
4. **File Deletion**: All files associated with closed cases are deleted:
   - Case folder: `backend/cases/{userId}/{caseId}/`
   - All files within the case folder (JSON, DOCX, uploaded files)
   - MCD JSON files

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Case Cleanup Configuration
CLOSED_CASE_RETENTION_DAYS=90          # Number of days to keep closed cases (default: 90)
CASE_CLEANUP_SCHEDULE="0 2 * * *"     # Cron schedule for automatic cleanup (default: daily at 2 AM)
ENABLE_AUTO_CLEANUP=true              # Enable/disable automatic cleanup (default: true)
TZ="America/New_York"                  # Timezone for scheduled tasks (default: America/New_York)
```

### Cron Schedule Examples

The `CASE_CLEANUP_SCHEDULE` uses standard cron syntax:

- `"0 2 * * *"` - Daily at 2:00 AM (default)
- `"0 0 * * 0"` - Weekly on Sunday at midnight
- `"0 */6 * * *"` - Every 6 hours
- `"0 0 1 * *"` - Monthly on the 1st at midnight
- `"disabled"` or `""` - Disable automatic cleanup

### Disabling Automatic Cleanup

To disable automatic cleanup, set one of these:

```bash
ENABLE_AUTO_CLEANUP=false
# OR
CASE_CLEANUP_SCHEDULE="disabled"
# OR
CASE_CLEANUP_SCHEDULE=""
```

## Manual Cleanup

You can manually trigger cleanup at any time:

```bash
POST /api/case-cleanup/manual
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Cleanup completed: 5 cases deleted, 0 errors",
  "deleted": 5,
  "errors": 0
}
```

## What Gets Deleted

When a closed case exceeds the retention period, the following are deleted:

1. **Case Folder**: `backend/cases/{userId}/{caseId}/`
   - `case.json` - Dashboard template JSON
   - `case.docx` - Master Case Document (DOCX)
   - `mcd.json` - MCD JSON file (if exists)
   - All other uploaded files in the case folder

2. **Note**: MCD records in MongoDB are **NOT** automatically deleted by default. This preserves database history. If you want to delete MongoDB records as well, uncomment the deletion line in `caseCleanupService.js`.

## Retention Policy

The retention period starts from when a case is marked as `closed` (based on the `updatedAt` timestamp in MongoDB).

**Example:**
- Case closed on: January 1, 2024
- Retention period: 90 days
- Cleanup date: April 1, 2024 (90 days later)

## Monitoring

Check server logs for cleanup activity:

```
[Auto Cleanup] Starting scheduled cleanup of closed cases...
[caseCleanup] Starting cleanup of closed cases (retention: 90 days)
[caseCleanup] Deleted case 12345 (closed 2024-01-01T00:00:00.000Z)
[caseCleanup] Cleanup complete: 5 cases deleted, 0 errors
[Auto Cleanup] Completed: 5 cases deleted, 0 errors
```

## Best Practices

1. **Set Appropriate Retention**: Adjust `CLOSED_CASE_RETENTION_DAYS` based on your legal requirements
2. **Regular Monitoring**: Check cleanup logs periodically to ensure it's working correctly
3. **Backup Strategy**: Ensure you have backups before enabling automatic deletion
4. **Test First**: Test the cleanup process manually before relying on automatic cleanup
5. **Timezone Configuration**: Set `TZ` environment variable to match your server's timezone

## Troubleshooting

### Cleanup Not Running

1. Check that `ENABLE_AUTO_CLEANUP` is not set to `false`
2. Verify `CASE_CLEANUP_SCHEDULE` is a valid cron expression
3. Check server logs for cron errors
4. Ensure MongoDB connection is working (cleanup queries MongoDB)

### Cases Not Being Deleted

1. Verify cases are marked as `status: 'closed'` in MongoDB
2. Check that `updatedAt` date is older than retention period
3. Review server logs for specific errors
4. Try manual cleanup to see detailed error messages

### Files Not Deleted

1. Check file system permissions
2. Verify case folder paths are correct
3. Review logs for file deletion errors
4. Ensure user has write permissions to case folders

## Security Considerations

- Cleanup requires authentication (via `requireAuth` middleware)
- Only cases belonging to authenticated users are processed
- File deletion is permanent - ensure backups are in place
- Consider implementing a "soft delete" option if needed

