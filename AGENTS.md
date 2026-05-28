# AGENTS.md

## Project Context

This project manages scheduled uploads for one or more YouTube channels. The backend stores OAuth accounts, upload schedules, and local video files, then uses a long-running scheduler process to upload videos at the selected publish time.

Primary stack:

- Backend: Node.js, Express, Google APIs, node-schedule, JSON-file storage.
- Frontend: React, TypeScript, Vite.
- Runtime data: `backend/data/db.json` and `backend/data/uploads/` by default.

## Operating Rules

- Keep all code, comments, and technical documentation in English.
- Treat `backend/data/`, `.env`, OAuth tokens, API keys, and uploaded videos as private runtime data.
- Do not commit secrets, uploaded videos, local database files, generated build output, or dependency folders.
- Prefer small, focused changes that preserve the current user workflow.
- Do not change YouTube publish behavior without testing the scheduler and upload path handling.

## Key Behaviors To Preserve

- Uploaded videos are stored as original files. The app must not transcode, resize, or recompress video files locally.
- Schedule records should store portable paths such as `uploads/<file>` instead of machine-specific absolute paths.
- Pending schedules must be restored on backend startup.
- In production, mock YouTube upload behavior must stay disabled unless `ALLOW_MOCK_AUTH=true` is explicitly set.
- The backend should be able to serve the built frontend from `frontend/dist` for a single-service deployment.

## Important Files

- `backend/index.js`: Express API, upload endpoint, schedule CRUD, static frontend serving.
- `backend/scheduler.js`: random publish-time calculation and upload worker.
- `backend/youtube_service.js`: OAuth, playlist lookup, YouTube upload, token refresh.
- `backend/db.js`: JSON database read/write helpers.
- `backend/storage_paths.js`: runtime data, upload path, and frontend build path resolution.
- `frontend/src/App.tsx`: main UI and API calls.
- `deploy/youtube-auto-scheduler.service`: systemd service template.
- `RUN.md`: local and service operation commands.

## Validation Checklist

Before handing off a change:

1. Run backend tests:
   ```bash
   cd backend
   npm test
   ```
2. Build the frontend:
   ```bash
   cd frontend
   npm run build
   ```
3. Start the backend and check health:
   ```bash
   cd backend
   NODE_ENV=production npm start
   curl http://localhost:3001/api/health
   ```
4. Confirm uploaded video paths are stored under `uploads/` and the referenced files exist in `backend/data/uploads/`.
5. Confirm no secret or runtime data is staged for commit.

## Deployment Notes

- Use one backend service in production. Build the frontend first; Express serves `frontend/dist`.
- Keep persistent data outside ephemeral deploy directories when possible by setting `DATA_DIR`.
- If moving machines, copy both `db.json` and the `uploads/` directory together.
- If OAuth redirect URI changes, update both Google Cloud credentials and the app settings.
