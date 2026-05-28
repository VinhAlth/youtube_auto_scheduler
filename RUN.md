# RUN.md

## Local Development

Install dependencies if needed:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Run backend:

```bash
cd backend
npm start
```

Run frontend dev server:

```bash
cd frontend
npm run dev
```

Default URLs:

- Backend API: `http://localhost:3001`
- Frontend dev server: usually `http://localhost:5173`
- Health check: `http://localhost:3001/api/health`

## Production Build

Build the frontend:

```bash
cd frontend
npm run build
```

Run as one production process:

```bash
cd backend
NODE_ENV=production PORT=3001 npm start
```

Open:

```text
http://localhost:3001
```

## Systemd Service

Copy the service template:

```bash
sudo cp deploy/youtube-auto-scheduler.service /etc/systemd/system/youtube-auto-scheduler.service
sudo systemctl daemon-reload
```

Start and enable service:

```bash
sudo systemctl enable --now youtube-auto-scheduler
```

Check service status:

```bash
systemctl status youtube-auto-scheduler --no-pager
```

Follow logs:

```bash
journalctl -u youtube-auto-scheduler -f
```

Restart service:

```bash
sudo systemctl restart youtube-auto-scheduler
```

Stop service:

```bash
sudo systemctl stop youtube-auto-scheduler
```

Quick project scripts:

```bash
./restart-service.sh
./run-server.sh
```

`restart-service.sh` restarts the existing service and checks local/public health.
`run-server.sh` rebuilds the frontend for `/youtube_auto_schedule/`, restarts/enables the service, and checks health.

## Service Checks

Check API health:

```bash
curl http://localhost:3001/api/health
```

Check configured channels:

```bash
curl http://localhost:3001/api/accounts
```

Check schedules:

```bash
curl http://localhost:3001/api/schedules
```

Check listening port:

```bash
ss -ltnp | grep ':3001'
```

Check backend process:

```bash
pgrep -af 'node index.js|npm start'
```

## Domain Checks

Example public app path:

```text
https://your-domain.example/youtube_auto_schedule/
```

Example server IP:

```text
203.0.113.10
```

Check the proxied app:

```bash
curl -I https://your-domain.example/youtube_auto_schedule/
curl -s https://your-domain.example/youtube_auto_schedule/api/health
```

Point the domain's `A` record to your server IP before enabling HTTPS:

```text
your-domain.example A 203.0.113.10
```

After DNS points to this server, issue SSL and use this OAuth redirect URI:

```text
https://your-domain.example/youtube_auto_schedule/api/auth/callback
```

## Google OAuth Redirect URI

Current public OAuth callback:

```text
https://your-domain.example/youtube_auto_schedule/api/auth/callback
```

In Google Cloud Console, open the OAuth 2.0 Client ID used by this app and add:

```text
Authorized JavaScript origins:
https://your-domain.example

Authorized redirect URIs:
https://your-domain.example/youtube_auto_schedule/api/auth/callback
```

The redirect URI must match exactly: same `https`, same domain, same path, no extra trailing slash.

Nginx config source:

```text
deploy/nginx-youtube-auto-scheduler.conf
```

Installed target:

```text
/etc/nginx/sites-available/youtube-auto-scheduler
```

## Data And Video Storage

Default data locations:

- Database: `backend/data/db.json`
- Uploaded videos and thumbnails: `backend/data/uploads/`

Production service environment in `deploy/youtube-auto-scheduler.service`:

```ini
Environment=DATA_DIR=/opt/youtube-auto-scheduler/backend/data
Environment=FRONTEND_DIST=/opt/youtube-auto-scheduler/frontend/dist
Environment=MAX_UPLOAD_SIZE_MB=10240
```

Video quality behavior:

- The backend saves the uploaded video file directly to disk.
- The backend does not compress, transcode, or resize the video before sending it to YouTube.
- YouTube may still process/transcode the video after upload, which is normal platform behavior.

## Safety Notes

- Back up `backend/data/db.json` and `backend/data/uploads/` together.
- Do not expose port `3001` publicly without authentication or a protected reverse proxy.
- Do not commit `.env`, `backend/data/db.json`, OAuth tokens, or uploaded videos.
- In production, mock login/upload is disabled by default. Use real Google API credentials.
