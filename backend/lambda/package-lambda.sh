#!/bin/bash

# Package Lambda Function for Deployment
# Usage: ./package-lambda.sh <function-name>
# Example: ./package-lambda.sh caseCleanupHandler
#
# This script packages a Lambda function with all required dependencies.
# Handler is kept in lambda/ subdirectory to maintain import paths.

set -e

FUNCTION_NAME=$1

if [ -z "$FUNCTION_NAME" ]; then
  echo "Error: Function name required"
  echo "Usage: ./package-lambda.sh <function-name>"
  echo "Functions: caseCleanupHandler, calendarNotificationHandler, cpnuSyncHandler"
  exit 1
fi

# Validate function name
if [ "$FUNCTION_NAME" != "caseCleanupHandler" ] && \
   [ "$FUNCTION_NAME" != "calendarNotificationHandler" ] && \
   [ "$FUNCTION_NAME" != "cpnuSyncHandler" ]; then
  echo "Error: Invalid function name: $FUNCTION_NAME"
  echo "Valid functions: caseCleanupHandler, calendarNotificationHandler, cpnuSyncHandler"
  exit 1
fi

echo "📦 Packaging Lambda function: $FUNCTION_NAME"

# Get script directory (lambda/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
PACKAGE_DIR="$TEMP_DIR/package"
ZIP_FILE="${FUNCTION_NAME}.zip"

# Create package directory structure
mkdir -p "$PACKAGE_DIR/lambda"

# Copy function handler (keep in lambda/ subdirectory to maintain import paths)
echo "📄 Copying handler..."
cp "$SCRIPT_DIR/${FUNCTION_NAME}.js" "$PACKAGE_DIR/lambda/${FUNCTION_NAME}.js"

# Copy required dependencies from backend directory
echo "📚 Copying dependencies..."
cd "$BACKEND_DIR"

# Copy lib directory (MongoDB connection and utilities)
echo "  → lib/"
cp -r lib "$PACKAGE_DIR/"

# Copy ALL services (services import each other)
echo "  → services/"
cp -r services "$PACKAGE_DIR/"

# Copy controllers (needed by calendarNotificationService)
echo "  → controllers/"
cp -r controllers "$PACKAGE_DIR/"

# Copy models directory
echo "  → models/"
cp -r models "$PACKAGE_DIR/"

# Copy utils directory
echo "  → utils/"
cp -r utils "$PACKAGE_DIR/"

# Copy middleware (needed by some controllers)
echo "  → middleware/"
cp -r middleware "$PACKAGE_DIR/"

# Copy package.json and package-lock.json for dependency installation
echo "  → package.json"
cp package.json "$PACKAGE_DIR/"
cp package-lock.json "$PACKAGE_DIR/" 2>/dev/null || echo "    ⚠️  package-lock.json not found (will install from package.json)"

# Install production dependencies
echo "📦 Installing dependencies..."
cd "$PACKAGE_DIR"
npm ci --production --no-optional 2>/dev/null || npm install --production --no-optional

# Verify package.json has correct type
if ! grep -q '"type": "module"' package.json; then
  echo "  ⚠️  Adding 'type: module' to package.json..."
  # Add type: module if missing (should already be there)
  sed -i.bak '1s/{/{ "type": "module",/' package.json || true
fi

# Remove large dependencies not needed for Lambda scheduled tasks
# These are only needed for CPNU scraping on EC2, not for Lambda functions
# Lambda functions only need: MongoDB, Express (for some services), and core dependencies
echo "🗑️  Removing large dependencies not needed for Lambda..."
echo "   Note: Puppeteer (~300MB) is excluded - only needed for CPNU scraping on EC2"
REMOVED_SIZE=0

# Remove puppeteer and related packages (can be 300+ MB)
if [ -d "node_modules/puppeteer" ]; then
  PUPPETEER_SIZE=$(du -sm node_modules/puppeteer 2>/dev/null | cut -f1 || echo "0")
  rm -rf node_modules/puppeteer
  echo "  ✓ Removed puppeteer (~${PUPPETEER_SIZE}MB)"
  REMOVED_SIZE=$((REMOVED_SIZE + PUPPETEER_SIZE))
fi

if [ -d "node_modules/puppeteer-extra" ]; then
  rm -rf node_modules/puppeteer-extra
  echo "  ✓ Removed puppeteer-extra"
fi

if [ -d "node_modules/puppeteer-extra-plugin-stealth" ]; then
  rm -rf node_modules/puppeteer-extra-plugin-stealth
  echo "  ✓ Removed puppeteer-extra-plugin-stealth"
fi

# Remove puppeteer cache if it exists
if [ -d "node_modules/.cache/puppeteer" ]; then
  rm -rf node_modules/.cache/puppeteer
  echo "  ✓ Removed puppeteer cache"
fi

# Remove other large optional dependencies that might not be needed
# (Add more exclusions here if needed)

if [ $REMOVED_SIZE -gt 0 ]; then
  echo "  ✅ Removed ~${REMOVED_SIZE}MB of unnecessary dependencies"
fi

# Check package size before zipping
echo "📊 Checking package size..."
UNCOMPRESSED_SIZE_MB=$(du -sm "$PACKAGE_DIR" 2>/dev/null | cut -f1 || echo "0")
UNCOMPRESSED_SIZE=$(du -sh "$PACKAGE_DIR" | cut -f1)

if [ "$UNCOMPRESSED_SIZE_MB" -gt 250 ]; then
  echo "  ⚠️  Warning: Uncompressed size is ${UNCOMPRESSED_SIZE_MB}MB (Lambda limit: 250MB)"
  echo "     Consider excluding more dependencies or using S3 deployment"
fi

# Create zip file
echo "🗜️  Creating zip file..."
cd "$TEMP_DIR"
zip -r "$ZIP_FILE" package/ > /dev/null

# Get package size
PACKAGE_SIZE_BYTES=$(stat -f%z "$ZIP_FILE" 2>/dev/null || stat -c%s "$ZIP_FILE" 2>/dev/null || echo "0")
PACKAGE_SIZE_MB=$((PACKAGE_SIZE_BYTES / 1024 / 1024))
PACKAGE_SIZE=$(du -h "$ZIP_FILE" | cut -f1)

# Check if package exceeds Lambda direct upload limit (50MB)
if [ "$PACKAGE_SIZE_MB" -gt 50 ]; then
  echo ""
  echo "  ⚠️  WARNING: Package size is ${PACKAGE_SIZE_MB}MB (exceeds 50MB direct upload limit)"
  echo "     Lambda direct upload limit: 50MB"
  echo "     Options:"
  echo "       1. Use S3 deployment (up to 250MB)"
  echo "       2. Exclude more dependencies"
  echo "       3. Use Lambda Layers for large dependencies"
  echo ""
fi

# Move zip to lambda directory
mv "$TEMP_DIR/$ZIP_FILE" "$SCRIPT_DIR/$ZIP_FILE"

# Cleanup
rm -rf "$TEMP_DIR"

echo "✅ Package created: lambda/$ZIP_FILE"
echo "   Size: $PACKAGE_SIZE (${PACKAGE_SIZE_MB}MB compressed), $UNCOMPRESSED_SIZE (${UNCOMPRESSED_SIZE_MB}MB uncompressed)"
if [ "$PACKAGE_SIZE_MB" -le 50 ]; then
  echo "   ✅ Within Lambda direct upload limit (50MB)"
else
  echo "   ⚠️  Exceeds direct upload limit - use S3 deployment"
fi
echo ""
echo "📋 Package structure:"
echo "   package/"
echo "   ├── lambda/${FUNCTION_NAME}.js  (handler)"
echo "   ├── lib/                         (MongoDB, utilities)"
echo "   ├── services/                    (all services)"
echo "   ├── controllers/                 (calendar controller)"
echo "   ├── models/                      (Mongoose models)"
echo "   ├── utils/                       (utility functions)"
echo "   ├── middleware/                  (auth middleware)"
echo "   ├── node_modules/                (dependencies)"
echo "   └── package.json"
echo ""
echo "📋 Lambda Configuration:"
echo "   Handler: lambda/${FUNCTION_NAME}.handler"
echo "   Runtime: nodejs20.x"
echo "   Timeout: 300 seconds (5 minutes)"
echo "   Memory: 512 MB (adjust based on function)"
echo ""
echo "📋 Next steps:"
echo "   1. Review package: unzip -l lambda/$ZIP_FILE | head -30"
echo "   2. Test locally: unzip -q lambda/$ZIP_FILE -d test && cd test/package && MONGO_URI=test node lambda/$FUNCTION_NAME.js"
echo "   3. Deploy to AWS:"
echo "      aws lambda update-function-code \\"
echo "        --function-name pepper-2.0-${FUNCTION_NAME} \\"
echo "        --zip-file fileb://lambda/$ZIP_FILE"
echo ""
