# Milestone 2: Document Extraction Agent - Test Guide

## Overview

Milestone 2 implements the Document Extraction Agent that extracts structured case data from legal documents using AI and generates Master Case Documents (MCD).

## New Endpoints

### 1. POST /api/mcd/extract-from-document
Extract case data from uploaded document (returns extracted data, does not create MCD)

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: FormData with `files` field containing the document file

**Response:**
```json
{
  "success": true,
  "extractedData": {
    "case_id": "TUT-214",
    "parties": {
      "plaintiff": "Johnson",
      "defendant": "State",
      "other": []
    },
    "case_type": "Criminal Defense",
    "status": "in_progress",
    "deadlines": [...],
    "last_documents": [...],
    "next_actions": [...],
    "summary": "..."
  },
  "fileName": "document.pdf",
  "wordCount": 1234
}
```

### 2. POST /api/mcd/generate-from-extraction
Generate MCD from previously extracted case data

**Request:**
```json
{
  "extractedData": {
    "case_id": "TUT-214",
    "parties": {...},
    "case_type": "...",
    ...
  },
  "source_document_id": "optional_document_id"
}
```

**Response:**
```json
{
  "success": true,
  "mcd": {...},
  "message": "Master Case Document creado exitosamente"
}
```

### 3. POST /api/mcd/extract-and-generate
Extract case data from document and generate MCD in one step

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: FormData with `files` field containing the document file

**Response:**
```json
{
  "success": true,
  "mcd": {...},
  "extractedData": {...},
  "fileName": "document.pdf",
  "message": "Master Case Document creado exitosamente desde documento"
}
```

## Test Examples

### Using curl

#### 1. Extract from document (without creating MCD)
```bash
curl -X POST http://localhost:3001/api/mcd/extract-from-document \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "files=@/path/to/document.pdf"
```

#### 2. Generate MCD from extraction
```bash
curl -X POST http://localhost:3001/api/mcd/generate-from-extraction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "extractedData": {
      "case_id": "TUT-214",
      "parties": {
        "plaintiff": "Johnson",
        "defendant": "State"
      },
      "case_type": "Criminal Defense",
      "status": "in_progress",
      "summary": "Case summary..."
    }
  }'
```

#### 3. Extract and generate in one step
```bash
curl -X POST http://localhost:3001/api/mcd/extract-and-generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "files=@/path/to/document.pdf"
```

### Using Frontend Client

```typescript
import { mcdClient } from '@/lib/mcdClient';

// Option 1: Extract only (two-step process)
const file = document.querySelector('input[type="file"]').files[0];
const extraction = await mcdClient.extractFromDocument(file);
console.log('Extracted data:', extraction.extractedData);

// Review and modify extractedData if needed, then generate MCD
const mcd = await mcdClient.generateFromExtraction(extraction.extractedData);

// Option 2: Extract and generate in one step
const result = await mcdClient.extractAndGenerateMCD(file);
console.log('MCD created:', result.mcd);
```

## AI Extraction Behavior

The AI extraction agent:
- ✅ Extracts ONLY explicit information from documents
- ✅ Does NOT perform deep legal analysis
- ✅ Does NOT calculate legal deadlines (only uses explicit dates)
- ✅ Does NOT interpret legal meaning
- ✅ Returns structured JSON data
- ✅ Handles missing fields gracefully (uses null or defaults)

## Supported File Types

- PDF (.pdf)
- Word (.docx)
- Text (.txt)
- Markdown (.md)
- CSV (.csv)
- RTF (.rtf)

## Error Handling

Common errors:
- `400`: No file uploaded or file extraction failed
- `401`: Authentication required
- `409`: Case ID already exists
- `500`: AI extraction error or server error

## Integration Notes

- The extraction uses DeepSeek API (configured via `DEEPSEEK_API_KEY`)
- Language is auto-detected from document text
- Case IDs are automatically normalized (uppercase)
- Deadlines are validated (invalid dates are filtered out)
- The system ensures no deadline computation (only explicit dates)

