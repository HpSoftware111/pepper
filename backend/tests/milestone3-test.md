# Milestone 3: Interactive Questionnaire - Test Guide

## Overview

Milestone 3 implements the Interactive Questionnaire system that allows users to create Master Case Documents through a guided, standardized form interface.

## New Endpoints

### 1. GET /api/mcd/questionnaire/template
Get questionnaire template structure (for frontend form generation)

**Response:**
```json
{
  "success": true,
  "template": {
    "case_id": {
      "label": "Case ID",
      "type": "text",
      "required": true,
      "placeholder": "e.g., TUT-214, CIV-442"
    },
    "parties": {...},
    "case_type": {...},
    "status": {...},
    "deadlines": {...},
    "next_actions": {...},
    "summary": {...}
  }
}
```

### 2. POST /api/mcd/questionnaire
Submit questionnaire and generate MCD

**Request:**
```json
{
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
  "next_actions": [
    {
      "title": "Witness prep session",
      "description": "Prepare witnesses for hearing",
      "priority": "urgent"
    }
  ],
  "summary": "Criminal defense case involving suppression motion."
}
```

**Response:**
```json
{
  "success": true,
  "mcd": {...},
  "message": "Master Case Document creado exitosamente desde cuestionario"
}
```

## Test Examples

### Using curl

#### 1. Get questionnaire template
```bash
curl -X GET http://localhost:3001/api/mcd/questionnaire/template \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 2. Submit questionnaire
```bash
curl -X POST http://localhost:3001/api/mcd/questionnaire \
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
    "next_actions": [
      {
        "title": "Witness prep session",
        "description": "Prepare witnesses for hearing",
        "priority": "urgent"
      }
    ],
    "summary": "Criminal defense case involving suppression motion."
  }'
```

### Using Frontend Component

```typescript
import CaseQuestionnaire from '@/components/CaseQuestionnaire';
import { useState } from 'react';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  const handleSuccess = (mcd) => {
    console.log('MCD created:', mcd);
    // Refresh case list, show success message, etc.
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Create Case from Questionnaire
      </button>
      <CaseQuestionnaire
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  );
}
```

### Using Frontend Client Directly

```typescript
import { mcdClient } from '@/lib/mcdClient';

// Get template
const template = await mcdClient.getQuestionnaireTemplate();
console.log('Template structure:', template.template);

// Submit questionnaire
const questionnaireData = {
  case_id: 'TUT-214',
  parties: {
    plaintiff: 'Johnson',
    defendant: 'State',
    other: [],
  },
  case_type: 'Criminal Defense',
  status: 'in_progress',
  deadlines: [
    {
      title: 'File motion to suppress',
      due_date: new Date('2024-03-18').toISOString(),
      case_id: 'TUT-214',
      owner: 'A. Pierce',
      completed: false,
    },
  ],
  next_actions: [
    {
      title: 'Witness prep session',
      description: 'Prepare witnesses for hearing',
      priority: 'urgent' as const,
    },
  ],
  summary: 'Criminal defense case involving suppression motion.',
};

const result = await mcdClient.submitQuestionnaire(questionnaireData);
console.log('MCD created:', result.mcd);
```

## Validation Rules

### Required Fields
- `case_id`: Must be non-empty string
- `parties`: Must contain at least one of:
  - `plaintiff` (non-empty string)
  - `defendant` (non-empty string)
  - `other` (array with at least one non-empty string)
- `case_type`: Must be non-empty string

### Optional Fields
- `status`: Must be one of: `new`, `review`, `in_progress`, `appeals`, `pending_decision`, `closed` (default: `new`)
- `deadlines`: Array of deadline objects
  - Each deadline must have: `title`, `due_date` (valid ISO date), `case_id`
  - Optional: `owner`, `completed` (default: `false`)
- `next_actions`: Array of action objects
  - Each action must have: `title`
  - Optional: `description`, `priority` (`urgent`, `pending`, `normal` - default: `pending`)
- `summary`: Optional string

## Error Handling

Common errors:
- `400`: Validation errors (returns `errors` array with specific field errors)
- `401`: Authentication required
- `409`: Case ID already exists
- `500`: Server error

Example error response:
```json
{
  "error": "Errores de validación en el cuestionario",
  "errors": [
    "case_id es requerido",
    "parties debe contener al menos un party (plaintiff, defendant, o other)",
    "deadlines[0].due_date debe ser una fecha válida"
  ]
}
```

## Component Features

The `CaseQuestionnaire` component provides:
- ✅ Modal-based form interface
- ✅ Dynamic deadline management (add/remove)
- ✅ Dynamic next action management (add/remove)
- ✅ Multiple party support (plaintiff, defendant, other parties)
- ✅ Date picker for deadlines
- ✅ Priority selection for actions
- ✅ Real-time validation
- ✅ Error display
- ✅ Loading states
- ✅ Dark/light theme support
- ✅ Responsive design

## Integration Notes

- The questionnaire creates MCDs with `source: 'questionnaire'`
- All validation rules match document extraction validation
- Case IDs are automatically normalized (uppercase)
- Deadlines must have explicit dates (no computation)
- The component can be pre-filled with `initialData` for editing existing cases

## Use Cases

1. **New Case Creation**: User has no document, wants to create case manually
2. **Standardized Input**: User prefers guided form over document extraction
3. **Case Editing**: Pre-fill form with existing MCD data for updates
4. **Quick Entry**: Fast case creation for simple cases

