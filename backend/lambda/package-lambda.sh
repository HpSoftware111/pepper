#!/bin/bash

# Package Lambda Function for Deployment
# Usage: ./package-lambda.sh <function-name>
# Example: ./package-lambda.sh caseCleanupHandler

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

# Create temporary directory
TEMP_DIR=$(mktemp -d)
PACKAGE_DIR="$TEMP_DIR/package"
ZIP_FILE="${FUNCTION_NAME}.zip"

# Create package directory
mkdir -p "$PACKAGE_DIR"

# Copy function handler
echo "📄 Copying handler..."
cp "lambda/${FUNCTION_NAME}.js" "$PACKAGE_DIR/handler.js"

# Copy required dependencies (relative to backend directory)
echo "📚 Copying dependencies..."
cd ..  # Go to backend directory

# Copy lib directory (MongoDB connection)
cp -r lib "$PACKAGE_DIR/"

# Copy services directory
cp -r services "$PACKAGE_DIR/"

# Copy models directory
cp -r models "$PACKAGE_DIR/"

# Copy utils directory
cp -r utils "$PACKAGE_DIR/"

# Copy middleware (if needed)
mkdir -p "$PACKAGE_DIR/middleware"

# Install production dependencies
echo "📦 Installing dependencies..."
cd "$PACKAGE_DIR"
npm install --production --no-optional

# Create package.json for Lambda (minimal)
cat > package.json << EOF
{
  "name": "${FUNCTION_NAME}",
  "version": "1.0.0",
  "type": "module",
  "main": "handler.js"
}
EOF

# Create zip file
echo "🗜️  Creating zip file..."
cd "$TEMP_DIR"
zip -r "$ZIP_FILE" package/ > /dev/null

# Move zip to lambda directory
cd "$OLDPWD"
mv "$TEMP_DIR/$ZIP_FILE" "lambda/$ZIP_FILE"

# Cleanup
rm -rf "$TEMP_DIR"

echo "✅ Package created: lambda/$ZIP_FILE"
echo ""
echo "📋 Next steps:"
echo "   1. Review package: unzip -l lambda/$ZIP_FILE"
echo "   2. Deploy to AWS: aws lambda update-function-code --function-name pepper-2.0-$FUNCTION_NAME --zip-file fileb://lambda/$ZIP_FILE"
