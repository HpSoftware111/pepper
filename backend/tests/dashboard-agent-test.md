# Dashboard Agent System - Test Guide

## Overview

The Dashboard Agent is a new AI agent that guides lawyers through creating case templates for the Dashboard. It uses file-based storage (no database) and generates JSON templates that feed the Dashboard directly.

## System Architecture

### Storage
- **Location**: `backend/cases/{userId}/{caseId}.json`
- **Format**: JSON files (one per case)
- **No Database**: All data stored as local files

### Agent Behavior
- Interactive guided questionnaire
- Step-by-step field collection
- Validation with clear error messages
- Auto-generates IDs and timestamps
- Outputs only JSON (no explanations)

## API Endpoints

### 1. POST /api/dashboard-agent/case/save
Save or update a case template

**Request:**
```json
{
  "case_id": "TUT-214",
  "client": "Johnson vs. State",
  "practice": "Criminal Defense",
  "type": "Criminal Defense",
  "attorney": "A. Pierce",
  "status": "active",
  "stage": "Discovery",
  "summary": "Criminal defense case involving suppression motion.",
  "hearing": "2024-03-21",
  "important_dates": [
    { "title": "Motion hearing", "date": "2024-03-21" }
  ],
  "recent_activity": [
    { "id": "uuid-here", "message": "Case template created", "time": "just now" }
  ],
  "deadlines": [
    {
      "title": "File motion to suppress",
      "caseId": "TUT-214",
      "due": "2024-03-18",
      "owner": "A. Pierce",
      "completed": false
    }
  ],
  "sidebar_case": {
    "id": "TUT-214",
    "name": "Johnson vs. State",
    "type": "Criminal Defense",
    "status": "active"
  }
}
```

**Response:**
```json
{
  "success": true,
  "file": "/path/to/cases/userId/TUT-214.json",
  "message": "Case template saved successfully"
}
```

### 2. GET /api/dashboard-agent/case/:id
Get a case template by ID

**Response:**
```json
{
  "success": true,
  "data": { /* DashboardTemplate */ }
}
```

### 3. GET /api/dashboard-agent/cases/all
Get all case IDs for the user

**Response:**
```json
{
  "success": true,
  "cases": ["TUT-214", "CIV-442", "FAM-118"]
}
```

## Test Scenarios

### Scenario 1: Create Case via Chat Agent

1. **Open Pepper Assistant**
2. **Select "Dashboard Agent" scenario**
3. **Start conversation** - Agent will greet you and ask for Case ID
4. **Answer questions step-by-step:**
   - Case ID: `TEST-001`
   - Client: `Test Client vs. Test Defendant`
   - Practice: `Criminal Defense`
   - Type: `Criminal Defense`
   - Attorney: `John Doe`
   - Status: `active`
   - Stage: `Discovery`
   - Summary: `Test case for dashboard integration`
   - Hearing: `2024-12-31` or `none`
   - Important dates: (optional)
   - Deadlines: (optional)
5. **Agent generates JSON** - Final response should be only JSON
6. **Save the JSON** - Use `dashboardAgentClient.saveCase()` to save

### Scenario 2: Save Case Template via API

```bash
curl -X POST http://localhost:3001/api/dashboard-agent/case/save \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "case_id": "TEST-002",
    "client": "Smith vs. Corporation",
    "practice": "Corporate Law",
    "type": "Corporate Law",
    "attorney": "Jane Smith",
    "status": "pending",
    "stage": "Negotiation",
    "summary": "Corporate merger dispute case.",
    "hearing": "none",
    "important_dates": [],
    "recent_activity": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "message": "Case template created",
        "time": "just now"
      }
    ],
    "deadlines": [
      {
        "title": "Submit merger documents",
        "caseId": "TEST-002",
        "due": "2024-12-20",
        "owner": "Jane Smith",
        "completed": false
      }
    ],
    "sidebar_case": {
      "id": "TEST-002",
      "name": "Smith vs. Corporation",
      "type": "Corporate Law",
      "status": "pending"
    }
  }'
```

### Scenario 3: Retrieve Case Template

```bash
curl -X GET http://localhost:3001/api/dashboard-agent/case/TEST-002 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Scenario 4: List All Cases

```bash
curl -X GET http://localhost:3001/api/dashboard-agent/cases/all \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Frontend Usage

### Using the Chat Agent

1. Open Pepper Assistant modal
2. Select "Dashboard Agent" from scenarios
3. Follow the interactive conversation
4. When JSON is generated, copy it
5. Use `dashboardAgentClient.saveCase()` to save

### Using the Client Directly

```typescript
import { dashboardAgentClient } from '@/lib/dashboardAgentClient';
import type { DashboardTemplate } from '@/lib/dashboardTemplate';
import { generateUUID } from '@/lib/dashboardTemplate';

// Create a case template
const template: DashboardTemplate = {
  case_id: 'TEST-003',
  client: 'Client Name vs. Defendant',
  practice: 'Family Law',
  type: 'Family Law',
  attorney: 'Attorney Name',
  status: 'active',
  stage: 'Drafting',
  summary: 'Family law case summary.',
  hearing: '2024-12-25',
  important_dates: [
    { title: 'Mediation session', date: '2024-12-20' }
  ],
  recent_activity: [
    {
      id: generateUUID(),
      message: 'Case template created',
      time: 'just now'
    }
  ],
  deadlines: [
    {
      title: 'File response',
      caseId: 'TEST-003',
      due: '2024-12-18',
      owner: 'Attorney Name',
      completed: false
    }
  ],
  sidebar_case: {
    id: 'TEST-003',
    name: 'Client Name vs. Defendant',
    type: 'Family Law',
    status: 'active'
  }
};

// Save the template
const result = await dashboardAgentClient.saveCase(template);
console.log('Case saved:', result);

// Retrieve a case
const caseData = await dashboardAgentClient.getCase('TEST-003');
console.log('Case data:', caseData.data);

// List all cases
const allCases = await dashboardAgentClient.getAllCases();
console.log('All cases:', allCases.cases);
```

## Validation Rules

### Required Fields
- `case_id`: Alphanumeric, dashes, underscores, dots only
- `client`: Non-empty string
- `practice`: Non-empty string
- `type`: Non-empty string
- `attorney`: Non-empty string
- `status`: Must be `active`, `pending`, or `urgent`
- `stage`: Non-empty string
- `summary`: Non-empty string
- `hearing`: YYYY-MM-DD format or `"none"`
- `sidebar_case`: Must match case_id and have valid status

### Optional Fields
- `important_dates`: Array of {title, date} objects
- `recent_activity`: Array of {id, message, time} objects
- `deadlines`: Array of {title, caseId, due, owner, completed} objects

### Date Format
- All dates must be in `YYYY-MM-DD` format
- `hearing` can be `"none"` if no hearing scheduled

### Consistency Rules
- `deadlines[].caseId` must match `case_id`
- `sidebar_case.id` should match `case_id`
- `sidebar_case.status` must match `status`

## File Structure

```
backend/
  cases/
    {userId}/
      TUT-214.json
      CIV-442.json
      TEST-001.json
```

## Error Handling

### Validation Errors
```json
{
  "success": false,
  "errors": [
    "Case ID is required.",
    "Status must be one of: active, pending, urgent.",
    "Deadline #0: caseId must match case_id."
  ]
}
```

### Common Errors
- `400`: Validation errors (see errors array)
- `401`: Unauthorized (missing or invalid token)
- `404`: Case not found
- `500`: Server error

## Integration with Dashboard

The Dashboard should read from these JSON files to display:
- Case list in sidebar
- Case details
- Deadlines
- Recent activity
- Important dates

## Testing Checklist

- [ ] Create case via chat agent
- [ ] Save case via API
- [ ] Retrieve case by ID
- [ ] List all cases
- [ ] Validate required fields
- [ ] Validate date formats
- [ ] Validate status enum
- [ ] Validate caseId consistency in deadlines
- [ ] Test error handling
- [ ] Verify file creation in `backend/cases/{userId}/`
- [ ] Test with multiple users (isolated file storage)

## Notes

- Files are stored per user (isolated by userId)
- No database required
- Files can be manually edited if needed
- Folder sync (future) will watch these files
- Dashboard reads directly from these JSON files

