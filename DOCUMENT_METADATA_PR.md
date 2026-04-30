# Document Metadata Model and Persistence

## Summary
Adds document metadata support so documents now carry title, type, status, tags, ownership, and timestamps.

## What Changed
- Added a database migration for `status` and `tags`
- Extended the backend document create flow to persist metadata
- Updated the document library UI to show metadata in a details modal
- Added timestamps in the table and modal views
- Added backend and frontend tests for metadata persistence and display

## Validation
- Backend tests pass
- Frontend tests pass
