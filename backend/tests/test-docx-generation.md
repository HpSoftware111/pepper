# Testing DOCX Generation with Long Summary Text

## Overview
This guide explains how to test the DOCX generation feature, especially with very long summary text that exceeds 2000 characters.

## Test Scenarios

### Test 1: Create Case via Dashboard Agent Chat

#### Steps:
1. **Open Pepper Assistant**
   - Navigate to the dashboard or open the chat modal
   - Select "Dashboard Agent" from the scenario options

2. **Start Conversation**
   - The agent will greet you and ask for Case ID
   - Enter a numeric Case ID (e.g., `123456`)

3. **Fill Required Fields**
   - Follow the agent's prompts to fill in:
     - Case ID: `123456` (numeric only)
     - Client: `Test Client vs. Test Defendant`
     - Practice: `Criminal Defense`
     - Type: `Criminal Defense`
     - Attorney: `John Doe`
     - Status: `active`
     - Stage: `Discovery`
     - **Summary: Use a VERY LONG text** (see example below)
     - Hearing: `2024-12-31` or `none`
     - Important dates: (optional)
     - Deadlines: (optional)

4. **Use Long Summary Text**
   Copy and paste this long summary text (over 2000 characters):
   ```
   This is a comprehensive criminal defense case involving multiple complex legal issues. The case centers around allegations of financial fraud and embezzlement spanning a period of three years. The defendant, a former executive at a major corporation, is accused of misappropriating funds through a sophisticated scheme involving shell companies and offshore accounts. The prosecution has presented evidence including bank records, email communications, and witness testimony from former colleagues. The defense strategy focuses on challenging the authenticity of key documents, questioning the credibility of prosecution witnesses, and presenting an alternative narrative that explains the financial transactions as legitimate business operations. The case has attracted significant media attention due to the high-profile nature of the defendant and the substantial amount of money involved. Legal experts have noted that the case raises important questions about corporate governance and financial oversight. The defense team has filed multiple motions challenging the admissibility of certain evidence and seeking to suppress statements made by the defendant during initial interviews. The court has scheduled several pre-trial hearings to address these motions and other procedural matters. The case is expected to proceed to trial within the next six months, pending resolution of outstanding motions and discovery issues. Both parties have engaged in extensive settlement negotiations, but no agreement has been reached thus far. The defendant maintains their innocence and has expressed confidence in the strength of their defense. The prosecution has indicated that they are prepared to present a strong case based on the evidence they have gathered. The outcome of this case could have significant implications for similar cases involving financial crimes and corporate fraud. The legal team is working diligently to prepare for trial and ensure that all procedural requirements are met. The case file contains numerous documents including depositions, expert reports, and financial analyses that will be crucial to the defense strategy. The defense team has also retained several expert witnesses who will testify on matters related to financial forensics, corporate accounting practices, and the interpretation of complex financial transactions. The prosecution has similarly engaged expert witnesses to support their case. The court has appointed a special master to oversee the discovery process and ensure that both parties comply with their obligations. The case management conference is scheduled for next month, at which time the court will establish a timeline for the remaining pre-trial proceedings. The defense team is optimistic about their chances of success, while the prosecution believes they have a strong case. The ultimate resolution of this matter will depend on the presentation of evidence, the credibility of witnesses, and the interpretation of applicable law by the court. This case represents a significant investment of time and resources for all parties involved, and the outcome will be closely watched by legal professionals and the public alike.
   ```

5. **Complete the Form**
   - Continue answering all required fields
   - The agent will generate JSON at the end

6. **Save the Case**
   - The system will automatically:
     - Save JSON file to `backend/cases/{userId}/123456.json`
     - Generate DOCX file to `backend/cases/{userId}/123456.docx`

#### Verification:
- Check backend console logs for:
  ```
  [dashboardAgent] JSON file saved: /path/to/cases/userId/123456.json
  [dashboardAgent] DOCX file generated: /path/to/cases/userId/123456.docx
  ```
- If DOCX generation fails, you'll see error logs with details

---

### Test 2: Verify DOCX File Structure

#### Steps:
1. **Locate the DOCX File**
   - Navigate to: `pepper-2.0/backend/cases/{userId}/123456.docx`
   - The `userId` is your MongoDB user ID

2. **Open the DOCX File**
   - Double-click to open in Microsoft Word or compatible software
   - Verify the structure:

   **Expected Structure:**
   - ✅ Cover page with warning message
   - ✅ Section 1: Case Information (table format)
   - ✅ Section 2: Case Summary
     - Should show "Brief Description of the Case:" label
     - **Long summary should be split into multiple paragraphs** (if >2000 chars)
     - Each paragraph should be readable and properly formatted
   - ✅ Section 3: Important Dates
   - ✅ Section 4: Deadlines
   - ✅ Section 5: Recent Activity Log
   - ✅ Section 6: Sidebar Case (table format)

3. **Check Summary Section**
   - The long summary text should be:
     - Split into multiple paragraphs (not one giant block)
     - Each paragraph should be readable
     - Proper spacing between paragraphs
     - No text cut off or missing

---

### Test 3: Test via API Directly

#### Using cURL:

```bash
# 1. Get your JWT token (from browser DevTools > Application > Local Storage)
TOKEN="your_jwt_token_here"

# 2. Create a case with long summary
curl -X POST http://localhost:3001/api/dashboard-agent/case/save \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "case_id": "999999",
    "client": "API Test Case",
    "practice": "Corporate Law",
    "type": "Corporate Law",
    "attorney": "Jane Smith",
    "status": "active",
    "stage": "Drafting",
    "summary": "This is a very long summary text that exceeds 2000 characters. ' + 
               'It should be automatically split into multiple paragraphs when generating the DOCX file. ' +
               'The text should wrap properly and remain readable. ' +
               'This is a comprehensive corporate law case involving complex merger and acquisition transactions. ' +
               'The case involves multiple parties, including the acquiring company, the target company, shareholders, ' +
               'and various regulatory bodies. The transaction requires careful navigation of securities laws, ' +
               'antitrust regulations, and corporate governance requirements. The legal team has been working ' +
               'diligently to ensure compliance with all applicable regulations and to protect the interests of all parties involved. ' +
               'The case has progressed through several stages including initial negotiations, due diligence, ' +
               'regulatory filings, and shareholder approval processes. The transaction is expected to close ' +
               'within the next quarter, pending final regulatory approvals and satisfaction of closing conditions. ' +
               'The legal documentation includes merger agreements, disclosure documents, regulatory filings, ' +
               'and various ancillary agreements. The case file contains extensive documentation including ' +
               'financial analyses, legal opinions, and regulatory correspondence. The legal team continues ' +
               'to monitor developments and ensure that all parties remain in compliance with their obligations. ' +
               'The successful completion of this transaction will represent a significant milestone for all parties involved. ' +
               'The case demonstrates the complexity of modern corporate transactions and the importance of ' +
               'careful legal planning and execution. The legal team is committed to ensuring a smooth and ' +
               'successful transaction process. This case has required extensive coordination between legal, ' +
               'financial, and operational teams. The documentation and processes developed for this case ' +
               'will serve as valuable templates for future transactions. The case has also highlighted ' +
               'the importance of early engagement of legal counsel in complex corporate transactions. ' +
               'The legal team has worked closely with all parties to identify and address potential issues ' +
               'before they become problems. This proactive approach has been instrumental in keeping the ' +
               'transaction on track and avoiding delays. The case continues to evolve as new information ' +
               'becomes available and as the parties work through the various stages of the transaction process.",
    "hearing": "none",
    "important_dates": [],
    "recent_activity": [
      {
        "id": "test-activity-1",
        "message": "Case created via API test",
        "time": "just now"
      }
    ],
    "deadlines": [],
    "sidebar_case": {
      "id": "999999",
      "name": "API Test Case",
      "type": "Corporate Law",
      "status": "active"
    }
  }'
```

#### Expected Response:
```json
{
  "success": true,
  "jsonFile": "/path/to/cases/userId/999999.json",
  "docxFile": "/path/to/cases/userId/999999.docx",
  "message": "Case template saved successfully. Both JSON (internal) and DOCX (user-facing) files have been generated."
}
```

#### Verify Files:
```bash
# Check if files exist
ls -lh pepper-2.0/backend/cases/{userId}/999999.*

# Check JSON file
cat pepper-2.0/backend/cases/{userId}/999999.json

# Check DOCX file (should exist and have size > 0)
ls -lh pepper-2.0/backend/cases/{userId}/999999.docx
```

---

### Test 4: Download DOCX via API

#### Using cURL:

```bash
# Download the DOCX file
curl -X GET http://localhost:3001/api/dashboard-agent/case/999999/docx \
  -H "Authorization: Bearer $TOKEN" \
  --output test-case-999999.docx

# Open the downloaded file
# On Windows:
start test-case-999999.docx

# On Mac:
open test-case-999999.docx

# On Linux:
xdg-open test-case-999999.docx
```

---

### Test 5: Test Edge Cases

#### Test with Extremely Long Summary (>5000 characters):

1. Create a case with a summary that's over 5000 characters
2. Verify the DOCX is generated successfully
3. Check that the summary is split into multiple paragraphs
4. Verify all text is present and readable

#### Test with Empty Summary:

1. Create a case with empty summary
2. Verify DOCX shows "Not provided." in the summary section

#### Test with Summary Exactly 2000 Characters:

1. Create a case with summary exactly 2000 characters
2. Verify it's handled as a single paragraph (not split)

---

## What to Look For

### ✅ Success Indicators:
- DOCX file is created in `backend/cases/{userId}/` directory
- File size is reasonable (>10KB for a case with long summary)
- File opens without errors in Word/LibreOffice
- Summary section shows multiple paragraphs (if >2000 chars)
- All text is readable and properly formatted
- No text is cut off or missing
- Proper spacing between paragraphs

### ❌ Failure Indicators:
- DOCX file is not created
- Error in backend console logs
- DOCX file is corrupted or won't open
- Summary text is missing or cut off
- Summary appears as one giant block (not split)
- File size is 0 bytes

---

## Troubleshooting

### If DOCX Generation Fails:

1. **Check Backend Logs:**
   ```
   [dashboardAgent] Error generating DOCX: [error message]
   [dashboardAgent] Error stack: [stack trace]
   [dashboardAgent] Case ID: [case_id]
   [dashboardAgent] Summary length: [length]
   ```

2. **Common Issues:**
   - **Missing `docx` package**: Run `npm install docx` in `pepper-2.0/backend`
   - **Permission errors**: Check file system permissions for `cases/` directory
   - **Path issues**: Verify the `cases/` directory exists and is writable
   - **Memory issues**: Very long text might cause memory problems (check Node.js memory limits)

3. **Verify Installation:**
   ```bash
   cd pepper-2.0/backend
   npm list docx
   ```

4. **Check Directory Permissions:**
   ```bash
   # Ensure cases directory exists and is writable
   ls -la pepper-2.0/backend/cases/
   ```

---

## Quick Test Script

Save this as `test-docx.sh`:

```bash
#!/bin/bash

# Configuration
TOKEN="your_jwt_token_here"
CASE_ID="$(date +%s)"  # Use timestamp as unique case ID
API_URL="http://localhost:3001"

echo "Testing DOCX generation with long summary..."
echo "Case ID: $CASE_ID"

# Create case with long summary
RESPONSE=$(curl -s -X POST "$API_URL/api/dashboard-agent/case/save" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"case_id\": \"$CASE_ID\",
    \"client\": \"Test Case\",
    \"practice\": \"Test Practice\",
    \"type\": \"Test Type\",
    \"attorney\": \"Test Attorney\",
    \"status\": \"active\",
    \"stage\": \"Test Stage\",
    \"summary\": \"$(python3 -c 'print("A" * 3000)')\",
    \"hearing\": \"none\",
    \"important_dates\": [],
    \"recent_activity\": [{\"id\": \"test-1\", \"message\": \"Test\", \"time\": \"now\"}],
    \"deadlines\": [],
    \"sidebar_case\": {\"id\": \"$CASE_ID\", \"name\": \"Test\", \"type\": \"Test\", \"status\": \"active\"}
  }")

echo "Response: $RESPONSE"

# Check if DOCX was generated
if echo "$RESPONSE" | grep -q "docxFile"; then
  echo "✅ DOCX generation successful!"
else
  echo "❌ DOCX generation failed!"
fi
```

Run with:
```bash
chmod +x test-docx.sh
./test-docx.sh
```

---

## Expected Results

When testing with a summary over 2000 characters:

1. **JSON File**: Contains the full summary text in one field
2. **DOCX File**: Summary is split into multiple paragraphs
3. **Each Paragraph**: Should be readable and properly formatted
4. **No Data Loss**: All text from the summary should appear in the DOCX
5. **Proper Formatting**: Paragraphs should have appropriate spacing

---

## Notes

- The DOCX generator splits text at sentence boundaries (`.`, `!`, `?`)
- Maximum paragraph length is 2000 characters
- If a single sentence exceeds 2000 characters, it will still be included (not split mid-sentence)
- The splitting preserves readability and natural text flow

