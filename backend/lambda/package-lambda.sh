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

cd "$BACKEND_DIR"

# =============================================================================
# Function-specific packaging
# - caseCleanupHandler: MINIMAL (mongoose + dotenv only) ~20MB unzipped
# - Others: full package + exclusions (must stay under 250MB unzipped)
# =============================================================================
if [ "$FUNCTION_NAME" = "caseCleanupHandler" ]; then
  echo "📦 Using minimal packaging (case-cleanup only)"
  mkdir -p "$PACKAGE_DIR/lib" "$PACKAGE_DIR/services" "$PACKAGE_DIR/models" "$PACKAGE_DIR/utils"
  cp -r lib/* "$PACKAGE_DIR/lib/"
  cp services/caseCleanupService.js "$PACKAGE_DIR/services/"
  cp models/MasterCaseDocument.js "$PACKAGE_DIR/models/"
  cp utils/caseFolderUtils.js utils/mcdFileStorage.js utils/lambdaDetector.js "$PACKAGE_DIR/utils/"
  cat > "$PACKAGE_DIR/package.json" << 'PKG'
{
  "name": "pepper-20-lambda-case-cleanup",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "mongoose": "^8.3.5",
    "dotenv": "^16.4.5"
  }
}
PKG
  echo "  → lib/, caseCleanupService, MasterCaseDocument, caseFolderUtils, mcdFileStorage, lambdaDetector"
  echo "  → Minimal deps: mongoose, dotenv only"
else
  echo "📚 Copying full dependencies..."
  cp -r lib "$PACKAGE_DIR/"
  cp -r services "$PACKAGE_DIR/"
  cp -r controllers "$PACKAGE_DIR/"
  cp -r models "$PACKAGE_DIR/"
  cp -r utils "$PACKAGE_DIR/"
  cp -r middleware "$PACKAGE_DIR/"
  cp package.json "$PACKAGE_DIR/"
  cp package-lock.json "$PACKAGE_DIR/" 2>/dev/null || true
fi

# Install production dependencies
echo "📦 Installing dependencies..."
cd "$PACKAGE_DIR"
if [ "$FUNCTION_NAME" = "caseCleanupHandler" ]; then
  npm install --production --no-optional
else
  npm ci --production --no-optional 2>/dev/null || npm install --production --no-optional
  if ! grep -q '"type": "module"' package.json; then
    sed -i.bak '1s/{/{ "type": "module",/' package.json 2>/dev/null || true
  fi
fi

# Remove large dependencies (skip for case-cleanup; it uses minimal packaging)
if [ "$FUNCTION_NAME" != "caseCleanupHandler" ]; then
echo "🗑️  Removing dependencies not needed for scheduled Lambda tasks..."
echo "   Excluding: puppeteer, express, openai, stripe, docx, mammoth, pdf-parse, multer, etc."
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

# Remove dependencies not needed for scheduled Lambda tasks
# These are only used for web server, file uploads, document generation, etc.
echo "   Removing web server and document processing dependencies..."

# Remove OpenAI (not needed for scheduled tasks)
if [ -d "node_modules/openai" ]; then
  OPENAI_SIZE=$(du -sm node_modules/openai 2>/dev/null | cut -f1 || echo "0")
  rm -rf node_modules/openai
  echo "  ✓ Removed openai (~${OPENAI_SIZE}MB)"
  REMOVED_SIZE=$((REMOVED_SIZE + OPENAI_SIZE))
fi

# Remove Stripe (payment processing - not needed for scheduled tasks)
if [ -d "node_modules/stripe" ]; then
  STRIPE_SIZE=$(du -sm node_modules/stripe 2>/dev/null | cut -f1 || echo "0")
  rm -rf node_modules/stripe
  echo "  ✓ Removed stripe (~${STRIPE_SIZE}MB)"
  REMOVED_SIZE=$((REMOVED_SIZE + STRIPE_SIZE))
fi

# Remove document generation libraries
if [ -d "node_modules/docx" ]; then
  DOCX_SIZE=$(du -sm node_modules/docx 2>/dev/null | cut -f1 || echo "0")
  rm -rf node_modules/docx
  echo "  ✓ Removed docx (~${DOCX_SIZE}MB)"
  REMOVED_SIZE=$((REMOVED_SIZE + DOCX_SIZE))
fi

if [ -d "node_modules/mammoth" ]; then
  rm -rf node_modules/mammoth
  echo "  ✓ Removed mammoth"
fi

if [ -d "node_modules/pdf-parse" ]; then
  rm -rf node_modules/pdf-parse
  echo "  ✓ Removed pdf-parse"
fi

# Remove file upload middleware (not needed for scheduled tasks)
if [ -d "node_modules/multer" ]; then
  rm -rf node_modules/multer
  echo "  ✓ Removed multer"
fi

# Remove Express and related middleware (scheduled tasks don't need web server)
# Note: Some services might import express, but scheduled tasks don't use it
if [ -d "node_modules/express" ]; then
  EXPRESS_SIZE=$(du -sm node_modules/express 2>/dev/null | cut -f1 || echo "0")
  rm -rf node_modules/express
  echo "  ✓ Removed express (~${EXPRESS_SIZE}MB)"
  REMOVED_SIZE=$((REMOVED_SIZE + EXPRESS_SIZE))
fi

if [ -d "node_modules/cors" ]; then
  rm -rf node_modules/cors
  echo "  ✓ Removed cors"
fi

if [ -d "node_modules/cookie-parser" ]; then
  rm -rf node_modules/cookie-parser
  echo "  ✓ Removed cookie-parser"
fi

# Remove CSV parsing (probably not needed for scheduled tasks)
if [ -d "node_modules/csv-parse" ]; then
  rm -rf node_modules/csv-parse
  echo "  ✓ Removed csv-parse"
fi

# Remove nodemailer (WhatsApp is used instead for notifications)
if [ -d "node_modules/nodemailer" ]; then
  NODEMAILER_SIZE=$(du -sm node_modules/nodemailer 2>/dev/null | cut -f1 || echo "0")
  rm -rf node_modules/nodemailer
  echo "  ✓ Removed nodemailer (~${NODEMAILER_SIZE}MB)"
  REMOVED_SIZE=$((REMOVED_SIZE + NODEMAILER_SIZE))
fi

# Clean up any orphaned dependencies
# Remove .bin symlinks for removed packages
find node_modules/.bin -type l 2>/dev/null | while read link; do
  target=$(readlink "$link" 2>/dev/null || echo "")
  if [[ "$target" == *"/puppeteer/"* ]] || \
     [[ "$target" == *"/openai/"* ]] || \
     [[ "$target" == *"/stripe/"* ]] || \
     [[ "$target" == *"/express/"* ]] || \
     [[ "$target" == *"/docx/"* ]]; then
    rm -f "$link"
  fi
done 2>/dev/null || true

if [ $REMOVED_SIZE -gt 0 ]; then
  echo "  ✅ Removed ~${REMOVED_SIZE}MB of unnecessary dependencies"
fi

# Summary of key dependencies kept
echo ""
echo "📦 Key dependencies kept (required for scheduled tasks):"
echo "   ✓ mongoose - MongoDB database"
echo "   ✓ googleapis - Google Calendar API"
echo "   ✓ twilio - WhatsApp notifications"
echo "   ✓ dotenv, jsonwebtoken, bcryptjs - Core utilities"
echo ""
fi

# Check package size before zipping
echo "📊 Checking package size..."
UNCOMPRESSED_SIZE_MB=$(du -sm "$PACKAGE_DIR" 2>/dev/null | cut -f1 || echo "0")
UNCOMPRESSED_SIZE=$(du -sh "$PACKAGE_DIR" | cut -f1)

if [ "$UNCOMPRESSED_SIZE_MB" -gt 250 ]; then
  echo "  ❌ ERROR: Uncompressed size is ${UNCOMPRESSED_SIZE_MB}MB (Lambda limit: 250MB)"
  echo "     Lambda rejects packages with unzipped size > 250MB."
  echo "     Exclude more dependencies or use function-specific minimal packaging."
  rm -rf "$TEMP_DIR"
  exit 1
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
if [ "$FUNCTION_NAME" = "caseCleanupHandler" ]; then
  echo "   ├── lib/                         (MongoDB)"
  echo "   ├── services/                    (caseCleanupService only)"
  echo "   ├── models/                      (MasterCaseDocument only)"
  echo "   ├── utils/                       (caseFolderUtils, mcdFileStorage, lambdaDetector)"
else
  echo "   ├── lib/, services/, controllers/, models/, utils/, middleware/"
fi
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
# Map handler name to Lambda function name
case "$FUNCTION_NAME" in
  caseCleanupHandler)
    LAMBDA_FUNCTION_NAME="pepper-20-case-cleanup"
    ;;
  calendarNotificationHandler)
    LAMBDA_FUNCTION_NAME="pepper-20-calendar-notifications"
    ;;
  cpnuSyncHandler)
    LAMBDA_FUNCTION_NAME="pepper-20-cpnu-sync"
    ;;
  *)
    LAMBDA_FUNCTION_NAME="pepper-20-${FUNCTION_NAME,,}"
    ;;
esac
echo "      aws lambda update-function-code \\"
echo "        --function-name ${LAMBDA_FUNCTION_NAME} \\"
echo "        --zip-file fileb://lambda/$ZIP_FILE"
echo ""
