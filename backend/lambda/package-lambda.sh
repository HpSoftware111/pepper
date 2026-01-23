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

# Create zip file
echo "🗜️  Creating zip file..."
cd "$TEMP_DIR"
zip -r "$ZIP_FILE" package/ > /dev/null

# Get package size
PACKAGE_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
UNCOMPRESSED_SIZE=$(du -sh "$PACKAGE_DIR" | cut -f1)

# Move zip to lambda directory
mv "$TEMP_DIR/$ZIP_FILE" "$SCRIPT_DIR/$ZIP_FILE"

# Cleanup
rm -rf "$TEMP_DIR"

echo "✅ Package created: lambda/$ZIP_FILE"
echo "   Size: $PACKAGE_SIZE (compressed), $UNCOMPRESSED_SIZE (uncompressed)"
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
