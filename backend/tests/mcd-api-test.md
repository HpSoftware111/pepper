# MCD API Test Guide

## Milestone 1: MCD Schema and Basic API

### Endpoints Created

1. **POST /api/mcd** - Create a new Master Case Document
2. **GET /api/mcd** - Get all MCDs for authenticated user
3. **GET /api/mcd/:caseId** - Get MCD by case_id
4. **PUT /api/mcd/:caseId** - Update MCD by case_id
5. **DELETE /api/mcd/:caseId** - Delete MCD by case_id
6. **POST /api/mcd/sync-from-file** - Sync MCD from local file

### Test Example (using curl or Postman)

#### 1. Create MCD
```bash
curl -X POST http://localhost:3001/api/mcd \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "case_id": "TUT-214",
    "parties": {
      "plaintiff": "Johnson",
      "defendant": "State",
      "other": []
    },
    "case_type": "Criminal Defense",
    "status": "in_progress",
    "deadlines": [
      {
        "title": "File motion to suppress",
        "due_date": "2024-03-18T00:00:00Z",
        "case_id": "TUT-214",
        "owner": "A. Pierce",
        "completed": false
      }
    ],
    "last_documents": [
      {
        "name": "motion_to_suppress.pdf",
        "uploaded_at": "2024-03-15T10:30:00Z",
        "type": "motion"
      }
    ],
    "next_actions": [
      {
        "title": "Witness prep session",
        "description": "Prepare witnesses for hearing",
        "priority": "urgent"
      }
    ],
    "summary": "Criminal defense case involving suppression motion. Hearing scheduled for March 21.",
    "source": "manual"
  }'
```

#### 2. Get All MCDs
```bash
curl -X GET http://localhost:3001/api/mcd \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3. Get MCD by Case ID
```bash
curl -X GET http://localhost:3001/api/mcd/TUT-214 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 4. Update MCD
```bash
curl -X PUT http://localhost:3001/api/mcd/TUT-214 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "status": "review",
    "summary": "Updated summary"
  }'
```

#### 5. Delete MCD
```bash
curl -X DELETE http://localhost:3001/api/mcd/TUT-214 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Frontend Usage Example

```typescript
import { mcdClient } from '@/lib/mcdClient';

// Create MCD
const newMCD = await mcdClient.createMCD({
  case_id: 'TUT-214',
  parties: {
    plaintiff: 'Johnson',
    defendant: 'State',
  },
  case_type: 'Criminal Defense',
  status: 'in_progress',
  summary: 'Case summary...',
});

// Get all MCDs
const allMCDs = await mcdClient.getAllMCDs({ status: 'in_progress' });

// Get specific MCD
const mcd = await mcdClient.getMCDByCaseId('TUT-214');

// Update MCD
const updated = await mcdClient.updateMCD('TUT-214', {
  status: 'review',
});

// Delete MCD
await mcdClient.deleteMCD('TUT-214');
```

### Validation Rules

- `case_id` is required and must be unique per user
- `parties` must contain at least one of: `plaintiff`, `defendant`, or `other`
- `case_type` is required
- `status` must be one of: `new`, `review`, `in_progress`, `appeals`, `pending_decision`, `closed`
- `deadlines` must have explicit `due_date` (no computed dates)
- All dates must be valid ISO date strings

### Database Collection

- Collection name: `master_case_documents`
- Indexes:
  - `case_id` (unique)
  - `user_id` + `case_id`
  - `user_email` + `status`
  - `user_id` + `status`
  - `deadlines.due_date`
  - `updatedAt` (descending)

