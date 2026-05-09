## 📋 Document Status & Tags Feature

Separated document status (draft/final/archived) from flexible tagging system. Users can now set document lifecycle state AND apply multiple category labels independently.

### ✅ What's New
- **Status flags**: 3 fixed states (draft, final, archived) for document lifecycle
- **Tags**: 14 predefined categories (Resume, Portfolio, Certification, etc.)
- **Modal editing**: Inline status dropdown & multi-select tag selector in document details
- **API endpoints**: POST/PATCH support + new GET `/documents/tags` endpoint
- **Removed from tags**: Draft, Final, Archived (now status-only)

### 📝 Changes
**Backend** (`backend/main.py`):
- Added `DOCUMENT_STATUSES` and `DOCUMENT_TAGS` constants
- Added `_validate_document_tags()` function (supports JSON array & comma-separated)
- Added `updateDocumentStatus()` and `updateDocumentTags()` functions
- Extended POST/PATCH endpoints to handle status & tags with validation

**Frontend** (`frontend/src/pages/DocumentLibrary.jsx`):
- Updated `DOCUMENT_TAGS` constant (removed Draft/Final/Archived)
- Added status/tag edit UI in document modal
- Added handlers for commit/cancel operations

**Hooks** (`frontend/src/hooks/useDocuments.js`):
- Added `updateDocumentStatus()` and `updateDocumentTags()` functions
- Added `updatingIds` state to track in-progress updates

**Tests** (`backend/tests/test_smoke.py`, `frontend/src/pages/DocumentLibrary.test.js`):
- Updated 2 backend tests to use valid tags
- Fixed frontend test mock with missing useDocuments properties

### 🧪 Testing
✅ **348** backend tests passing  
✅ **598** frontend tests passing (30 DocumentLibrary-specific)

### 📊 Files Modified
- `backend/main.py`
- `backend/tests/test_smoke.py`
- `frontend/src/pages/DocumentLibrary.jsx`
- `frontend/src/hooks/useDocuments.js`
- `frontend/src/pages/DocumentLibrary.test.js`

### 🔧 API
```javascript
// Create with status & tags
POST /documents
{ "status": "final", "tags": ["Resume", "Portfolio"] }

// Update status & tags independently
PATCH /documents/{id}
{ "status": "final", "tags": ["Resume"] }

// Get available tags
GET /documents/tags
```

### ⚠️ Breaking Changes
None - backward compatible. Documents without status/tags default to null.
