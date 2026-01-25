# Lambda Deployment Checklist

## ✅ Completed

- [x] **Package size fixed** - Excluded puppeteer and unnecessary dependencies (now 40MB zipped, under 50MB limit)
- [x] **Unzipped size fix** - case-cleanup uses minimal packaging (mongoose + dotenv only) ~20MB unzipped, under 250MB Lambda limit
- [x] **Function names fixed** - Changed from `pepper-2.0-*` to `pepper-20-*` (valid AWS Lambda names)
- [x] **Workflow updated** - All function names updated in GitHub Actions workflow
- [x] **Documentation updated** - All references updated in README.md and DEPLOYMENT.md
- [x] **Packaging script optimized** - Function-specific packaging; case-cleanup minimal, others full + exclusions

## ⏳ Pending Actions

### 1. Add AWS_LAMBDA_ROLE_ARN to GitHub Secrets

**Status:** ⚠️ **Action Required**

**Steps:**
1. Go to GitHub → Repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"**
3. Add:
   - **Name:** `AWS_LAMBDA_ROLE_ARN`
   - **Value:** `arn:aws:iam::767397873053:role/LambdaExecutionRole-Pepper20`
4. Click **"Add secret"**

**Verification:**
- Check that the secret exists in GitHub Secrets
- The workflow will use this automatically

---

### 2. Ask Client to Add iam:PassRole Permission

**Status:** ⚠️ **Action Required - Ask Client**

**Message to send to client:**

> "Hi! I have the Lambda execution role ARN. However, I'm getting an `AccessDeniedException` when trying to create Lambda functions.
>
> **Issue:** The IAM user `lambda-freelancer-temp` needs permission to pass the Lambda execution role.
>
> **Required Permission:**
> Please add this policy to the IAM user `lambda-freelancer-temp`:
>
> ```json
> {
>   "Version": "2012-10-17",
>   "Statement": [
>     {
>       "Effect": "Allow",
>       "Action": "iam:PassRole",
>       "Resource": "arn:aws:iam::767397873053:role/LambdaExecutionRole-Pepper20"
>     }
>   ]
> }
> ```
>
> This will allow me to create Lambda functions that use this execution role.
>
> Thanks!"

**Verification:**
- After client adds permission, re-run the workflow
- Deployment should succeed

---

### 3. Add MONGO_URI to GitHub Secrets (Optional but Recommended)

**Status:** ⚠️ **Recommended**

**Steps:**
1. Go to GitHub → Repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"**
3. Add:
   - **Name:** `MONGO_URI`
   - **Value:** Your MongoDB connection string (same as EC2)
4. Click **"Add secret"**

**Note:** If not set, Lambda functions will be created without MONGO_URI and you'll need to configure it manually in AWS Console.

---

## 📋 Current Status Summary

| Item | Status | Notes |
|------|--------|-------|
| Package Size | ✅ Fixed | 40MB (under 50MB limit) |
| Function Names | ✅ Fixed | Changed to `pepper-20-*` format |
| AWS Credentials | ✅ Set | `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` configured |
| Lambda Role ARN | ⏳ Pending | Need to add to GitHub Secrets |
| iam:PassRole Permission | ⏳ Pending | Client needs to add this |
| MONGO_URI | ⏳ Optional | Recommended for automatic configuration |

---

## 🚀 After All Steps Complete

Once both pending actions are done:

1. **Push changes** or **re-run workflow** manually
2. **Lambda functions will be created** automatically
3. **Verify deployment** in AWS Console
4. **Configure EventBridge rules** (see `DEPLOYMENT.md` for EventBridge setup)
5. **Test Lambda functions** manually
6. **Disable EC2 cron jobs** (see `backend/scripts/CRON_MIGRATION_GUIDE.md`)

---

## 🔍 Verification Steps

After deployment succeeds:

```bash
# Check functions exist
aws lambda list-functions --query "Functions[?contains(FunctionName, 'pepper-20')].FunctionName"

# Check function status
aws lambda get-function --function-name pepper-20-case-cleanup

# View logs
aws logs tail /aws/lambda/pepper-20-case-cleanup --follow
```

---

## 📞 Quick Reference

**Lambda Execution Role ARN:**
```
arn:aws:iam::767397873053:role/LambdaExecutionRole-Pepper20
```

**Function Names:**
- `pepper-20-case-cleanup`
- `pepper-20-calendar-notifications`
- `pepper-20-cpnu-sync`

**Package Size:** 40MB ✅

**GitHub Secrets Needed:**
- `AWS_ACCESS_KEY_ID` ✅
- `AWS_SECRET_ACCESS_KEY` ✅
- `AWS_LAMBDA_ROLE_ARN` ⏳ (add: `arn:aws:iam::767397873053:role/LambdaExecutionRole-Pepper20`)
- `MONGO_URI` ⏳ (optional but recommended)

---

**Last Updated:** 2025-01-23
