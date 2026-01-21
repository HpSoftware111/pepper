# Dashboard Agent Updates - Client Requirements Implementation

## Summary of Changes

All client requirements have been implemented according to the specifications.

## ✅ Key Updates

### 1. **Case ID Validation - Numeric Only**
- **Before**: Case IDs allowed letters, numbers, dashes, underscores, and dots
- **After**: Case IDs must be **numeric only** (no letters, dashes, or special characters)
- **Reason**: Compatibility with Colombian judicial case numbers (radicados) and future webscraping module
- **Files Updated**:
  - `backend/routes/dashboardAgentRoutes.js` - `validateCaseId()` function
  - `frontend/lib/dashboardTemplate.ts` - `validateCaseId()` function

### 2. **Dual Output System**
- **JSON File** (Internal - Hidden from user)
  - Stored in `backend/cases/{userId}/{caseId}.json`
  - Used by Dashboard for data updates
  - User never sees or interacts with this file
  
- **DOCX File** (User-facing - Master Case Document)
  - Stored in `backend/cases/{userId}/{caseId}.docx`
  - Clean, well-formatted Word document
  - Lawyer sees and stores this in their case folder
  - Always synchronized with JSON version

### 3. **DOCX Template Structure**
The DOCX follows the exact structure specified:

- **Cover Page**
  - Title: "PEPPER – CASE DASHBOARD MASTER DOCUMENT"
  - Warning: "Do not edit this document manually"
  - Instructions: "To update information, please use Pepper again"

- **Section 1 — Case Information** (Table format)
  - Case ID (numeric)
  - Case Name / Client
  - Practice Area
  - Case Type
  - Assigned Attorney
  - Overall Status
  - Stage
  - Next Hearing

- **Section 2 — Case Summary**
  - Brief description of the case

- **Section 3 — Important Dates** (Optional)
  - Title and date for each important date
  - "No additional important dates have been recorded" if empty

- **Section 4 — Deadlines**
  - Each deadline with title, due date, responsible, and completed status
  - "There are currently no deadlines registered" if empty

- **Section 5 — Recent Activity Log**
  - Activity ID, message, and timestamp
  - Automatically includes most recent activity

- **Section 6 — Sidebar Case** (Reference for Dashboard)
  - Table format with Case ID, Name, Type, Status

### 4. **System Prompt Updates**
- Updated to mention dual output (JSON + DOCX)
- Emphasizes that user should never see JSON
- Warns against manual editing of DOCX
- Clarifies Case ID must be numeric only
- Updated starting message to explain both outputs

### 5. **Manual Editing Prevention**
- DOCX cover page includes clear warning
- System prompt instructs Pepper to tell users:
  - "To update this case, please use Pepper again"
  - "Do not modify the Word document manually, because the Dashboard may stop working"
- Ensures data integrity and prevents dashboard errors

## 📁 Files Created/Modified

### New Files
- `backend/utils/docxGenerator.js` - DOCX generation utility

### Modified Files
- `backend/routes/dashboardAgentRoutes.js`
  - Updated `validateCaseId()` to numeric only
  - Updated `/case/save` route to generate both JSON and DOCX
  - Added `/case/:id/docx` route for downloading DOCX files
  
- `backend/controllers/dashboardAgentController.js`
  - Updated system prompt with dual output information
  - Updated starting message
  - Added Case ID numeric validation instructions

- `frontend/lib/dashboardTemplate.ts`
  - Updated `validateCaseId()` to numeric only

- `frontend/lib/dashboardAgentClient.ts`
  - Updated `saveCase()` response type
  - Added `downloadDocx()` method

## 🔧 Technical Implementation

### DOCX Generation
- Uses `docx` library (installed via npm)
- Generates properly formatted Word documents
- Includes tables, headings, and proper spacing
- Handles empty values with "Not provided." placeholder
- Follows exact structure specified by client

### File Storage
- Both files saved in same directory: `backend/cases/{userId}/`
- JSON: `{caseId}.json`
- DOCX: `{caseId}.docx`
- Both files always synchronized

### API Endpoints
- `POST /api/dashboard-agent/case/save` - Saves JSON and generates DOCX
- `GET /api/dashboard-agent/case/:id` - Retrieves JSON data
- `GET /api/dashboard-agent/case/:id/docx` - Downloads DOCX file
- `GET /api/dashboard-agent/cases/all` - Lists all case IDs

## ✅ Validation Rules Updated

### Case ID
- **Old**: `/^[A-Za-z0-9\-_.]+$/` (alphanumeric + special chars)
- **New**: `/^\d+$/` (numeric only)
- **Error Message**: "Case ID must be numeric only (no letters, dashes, or special characters)."

## 🎯 User Experience

1. **Lawyer interacts with Pepper** → Answers questions
2. **Pepper generates JSON** → Hidden from user
3. **Pepper generates DOCX** → User sees and saves this
4. **User stores DOCX** → In their case folder
5. **Dashboard updates** → From JSON file automatically
6. **User wants to update** → Uses Pepper again (never edits DOCX manually)

## 📝 Notes

- JSON file is never exposed to the user
- DOCX file is the only user-facing document
- Both files must stay synchronized
- All updates go through Pepper
- Case IDs are strictly numeric for Colombian legal compatibility

## 🚀 Testing

To test the implementation:

1. **Create a case** via Dashboard Agent
2. **Verify JSON file** is created (check `backend/cases/{userId}/`)
3. **Verify DOCX file** is created (same directory)
4. **Download DOCX** via `/api/dashboard-agent/case/:id/docx`
5. **Verify DOCX structure** matches template
6. **Test Case ID validation** - try non-numeric IDs (should fail)
7. **Test numeric Case IDs** - should succeed

## ✅ All Requirements Met

- ✅ Case ID numeric only
- ✅ Dual output (JSON + DOCX)
- ✅ JSON hidden from user
- ✅ DOCX user-facing
- ✅ Manual editing prevention
- ✅ DOCX template structure
- ✅ Synchronization between files
- ✅ Clear warnings and instructions

