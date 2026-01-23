# Lambda Packaging Fixes - Summary

## ✅ Fixed Issues

### 1. **Import Path Resolution** ✅
- **Problem**: Handler was copied to root as `handler.js`, but imports used `../lib/mongo.js`
- **Fix**: Handler now kept in `lambda/` subdirectory to maintain relative import paths
- **Lambda Handler Path**: `lambda/caseCleanupHandler.handler`

### 2. **Missing Dependencies** ✅
- **Problem**: Only specific service was copied, but services import each other
- **Fix**: Now copies ALL services, controllers, models, utils, and middleware
- **Dependencies Copied**:
  - ✅ `lib/` - MongoDB connection
  - ✅ `services/` - ALL services (not just one)
  - ✅ `controllers/` - Calendar controller (needed by calendarNotificationService)
  - ✅ `models/` - All Mongoose models
  - ✅ `utils/` - Utility functions
  - ✅ `middleware/` - Auth middleware

### 3. **Package Structure** ✅
- **New Structure**:
  ```
  package/
  ├── lambda/
  │   └── caseCleanupHandler.js  (handler with correct imports)
  ├── lib/
  ├── services/
  ├── controllers/
  ├── models/
  ├── utils/
  ├── middleware/
  ├── node_modules/
  └── package.json
  ```

### 4. **Dependency Installation** ✅
- Uses `npm ci` (faster, more reliable) with fallback to `npm install`
- Installs only production dependencies
- Preserves `package-lock.json` if available

---

## ⚠️ Critical Issues Still Remaining

### 1. **File System Operations** 🔴 HIGH PRIORITY

**Problem**: Case cleanup and CPNU sync services use local filesystem:

```javascript
// caseFolderUtils.js
const casesDir = path.join(__dirname, '..', 'cases', userIdStr);
fs.mkdirSync(casesDir, { recursive: true });
fs.unlinkSync(filePath);  // Delete files
```

**Issue**: Lambda filesystem is **read-only** (except `/tmp`). These operations will **FAIL** in Lambda.

**Current Behavior**:
- `getUserCasesDir()` tries to create `../cases/userId/` relative to Lambda code
- `deleteCaseFolder()` tries to delete files from local filesystem
- Both will fail with `EACCES` or `EROFS` errors

**Solutions**:

**Option A: Use S3 for Case Storage** (Recommended)
- Store case files in S3 bucket
- Update `caseFolderUtils.js` to use S3 SDK
- Update `caseCleanupService.js` to delete from S3
- Requires refactoring

**Option B: Use `/tmp` Directory** (Temporary fix)
- Modify `caseFolderUtils.js` to use `/tmp/cases/` in Lambda
- **Limitation**: `/tmp` is cleared between invocations (1GB limit, 512MB default)
- Files won't persist across Lambda invocations

**Option C: Keep File Operations on EC2** (Not ideal)
- Only run case cleanup on EC2 (not Lambda)
- Use Lambda only for calendar notifications and CPNU sync
- Mixed architecture

**Recommendation**: Implement Option A (S3) for production. For now, Option B allows Lambda to work but files won't persist.

---

### 2. **Large Dependencies** 🟡 MEDIUM PRIORITY

**Potential Issues**:
- `puppeteer` (~300MB) - Likely not needed for scheduled tasks
- `googleapis` - Needed for calendar notifications
- `twilio` - Needed for WhatsApp

**Current Package Size**: Check after packaging:
```bash
unzip -l lambda/caseCleanupHandler.zip | tail -1
```

**If > 50MB uncompressed**:
- Consider Lambda Layers for large dependencies
- Or exclude unused dependencies (e.g., puppeteer for scheduled tasks)

---

### 3. **Environment Variables** 🟡 MEDIUM PRIORITY

**Current**: Handlers use `process.env.MONGO_URI` directly

**Better Approach**: Use AWS Systems Manager Parameter Store
```javascript
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
const param = await ssm.send(new GetParameterCommand({
  Name: '/pepper-2.0/mongo-uri',
  WithDecryption: true
}));
```

**Benefits**:
- Secure storage (encrypted)
- Centralized configuration
- No hardcoded values in code

---

## 📋 Testing Checklist

After packaging, verify:

```bash
# 1. Package function
cd backend/lambda
./package-lambda.sh caseCleanupHandler

# 2. Check package size
unzip -l caseCleanupHandler.zip | tail -1
# Should be < 50MB uncompressed

# 3. Verify structure
unzip -l caseCleanupHandler.zip | grep -E "(lambda/|lib/|services/|controllers/)"

# 4. Test locally (extract and verify imports)
unzip -q caseCleanupHandler.zip -d test-package
cd test-package/package
node -e "import('./lambda/caseCleanupHandler.js').then(m => console.log('✅ Handler loads:', m.handler ? 'OK' : 'MISSING'))"

# 5. Check dependencies
ls node_modules/ | wc -l
# Should have mongoose, dotenv, etc.
```

---

## 🚀 Deployment Notes

### Lambda Configuration

```bash
# Handler path (IMPORTANT: includes lambda/ prefix)
Handler: lambda/caseCleanupHandler.handler

# Runtime
Runtime: nodejs20.x

# Timeout
Timeout: 300 seconds (5 minutes)

# Memory
Memory: 512 MB (adjust based on function needs)

# Environment Variables
MONGO_URI: (from Parameter Store or env var)
TZ: America/New_York (or America/Bogota for CPNU)
```

### IAM Permissions Required

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

**If MongoDB is in VPC**, also need:
- VPC configuration in Lambda
- Security group allowing outbound to MongoDB
- NAT Gateway or VPC endpoints for internet access

---

## 📝 Next Steps

1. ✅ **Packaging script fixed** - Ready to use
2. 🔴 **Fix file system operations** - Critical before deployment
3. 🟡 **Test packaging** - Verify all dependencies included
4. 🟡 **Set up Parameter Store** - For secure env vars
5. 🟡 **Configure VPC** - If MongoDB requires it
6. 🟢 **Deploy and test** - Verify Lambda execution

---

## 🔍 Verification Commands

```bash
# Package all functions
./package-lambda.sh caseCleanupHandler
./package-lambda.sh calendarNotificationHandler
./package-lambda.sh cpnuSyncHandler

# Check sizes
ls -lh *.zip

# Verify structure
for zip in *.zip; do
  echo "=== $zip ==="
  unzip -l "$zip" | grep -E "lambda/.*\.js$|lib/|services/|controllers/"
done
```
