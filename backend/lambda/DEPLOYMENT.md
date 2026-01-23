# Lambda Deployment Guide

## CI/CD Integration

Lambda functions are automatically deployed via GitHub Actions when:
- Lambda handler files change (`backend/lambda/**`)
- Service files change (`backend/services/**`)
- Library files change (`backend/lib/**`, `backend/utils/**`)
- Manual trigger via workflow_dispatch

## Required GitHub Secrets

Configure these secrets in your GitHub repository settings:

| Secret Name | Description | Example |
|------------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key for Lambda deployment | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_REGION` | AWS region (optional, defaults to us-east-1) | `us-east-1` |
| `AWS_LAMBDA_ROLE_ARN` | IAM role ARN for Lambda execution | `arn:aws:iam::123456789012:role/lambda-execution-role` |
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://...` |

## IAM Role Setup

The Lambda execution role needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/pepper-2.0/*"
    }
  ]
}
```

## Deployment Process

1. **Package**: Each Lambda function is packaged with dependencies
2. **Deploy**: Functions are created or updated in AWS Lambda
3. **Verify**: Deployment status is checked and reported

## EventBridge Configuration

After deployment, configure EventBridge rules:

### Case Cleanup (Daily 2:00 AM EST)
```bash
aws events put-rule \
  --name pepper-2.0-case-cleanup-schedule \
  --schedule-expression "cron(0 2 * * ? *)" \
  --description "Trigger case cleanup daily at 2 AM EST"

aws events put-targets \
  --rule pepper-2.0-case-cleanup-schedule \
  --targets "Id=1,Arn=arn:aws:lambda:REGION:ACCOUNT:function:pepper-2.0-case-cleanup"
```

### Calendar Notifications (Every 5 minutes)
```bash
aws events put-rule \
  --name pepper-2.0-calendar-notifications-schedule \
  --schedule-expression "rate(5 minutes)" \
  --description "Trigger calendar notifications every 5 minutes"

aws events put-targets \
  --rule pepper-2.0-calendar-notifications-schedule \
  --targets "Id=1,Arn=arn:aws:lambda:REGION:ACCOUNT:function:pepper-2.0-calendar-notifications"
```

### CPNU Sync (12:00 PM and 7:00 PM Colombia time)
```bash
# 12 PM rule
aws events put-rule \
  --name pepper-2.0-cpnu-sync-12pm \
  --schedule-expression "cron(0 12 * * ? *)" \
  --description "Trigger CPNU sync at 12 PM Colombia time"

aws events put-targets \
  --rule pepper-2.0-cpnu-sync-12pm \
  --targets "Id=1,Arn=arn:aws:lambda:REGION:ACCOUNT:function:pepper-2.0-cpnu-sync"

# 7 PM rule
aws events put-rule \
  --name pepper-2.0-cpnu-sync-7pm \
  --schedule-expression "cron(0 19 * * ? *)" \
  --description "Trigger CPNU sync at 7 PM Colombia time"

aws events put-targets \
  --rule pepper-2.0-cpnu-sync-7pm \
  --targets "Id=1,Arn=arn:aws:lambda:REGION:ACCOUNT:function:pepper-2.0-cpnu-sync"
```

## Manual Deployment

If you need to deploy manually:

```bash
# Package functions
cd backend/lambda
./package-lambda.sh caseCleanupHandler
./package-lambda.sh calendarNotificationHandler
./package-lambda.sh cpnuSyncHandler

# Deploy to AWS
aws lambda update-function-code \
  --function-name pepper-2.0-case-cleanup \
  --zip-file fileb://caseCleanupHandler.zip

aws lambda update-function-code \
  --function-name pepper-2.0-calendar-notifications \
  --zip-file fileb://calendarNotificationHandler.zip

aws lambda update-function-code \
  --function-name pepper-2.0-cpnu-sync \
  --zip-file fileb://cpnuSyncHandler.zip
```

## Monitoring

After deployment, monitor Lambda functions:

```bash
# View logs
aws logs tail /aws/lambda/pepper-2.0-case-cleanup --follow
aws logs tail /aws/lambda/pepper-2.0-calendar-notifications --follow
aws logs tail /aws/lambda/pepper-2.0-cpnu-sync --follow

# Check function status
aws lambda get-function --function-name pepper-2.0-case-cleanup
```

## Troubleshooting

### Function creation fails
- Verify `AWS_LAMBDA_ROLE_ARN` secret is set correctly
- Check IAM role has necessary permissions
- Ensure role trust policy allows Lambda service

### Function update fails
- Check function exists: `aws lambda get-function --function-name <name>`
- Verify zip file was created successfully
- Check AWS credentials have `lambda:UpdateFunctionCode` permission

### Environment variables not set
- Functions are created with `MONGO_URI` from secrets
- Additional variables can be set via AWS Console or CLI
- Consider using Parameter Store for sensitive values

## Next Steps

After successful Lambda deployment:

1. ✅ Configure EventBridge rules (see above)
2. ✅ Test Lambda functions manually
3. ✅ Monitor CloudWatch logs
4. ✅ Disable EC2 cron jobs (see `backend/scripts/CRON_MIGRATION_GUIDE.md`)
