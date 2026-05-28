import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

import {
  getAccounts,
  saveAccount,
  deleteAccount,
  getSchedules,
  saveSchedule,
  deleteSchedule,
  getScheduleById,
  readDb,
  writeDb,
  getStorageInfo
} from './db.js';
import {
  configureApi,
  isApiConfigured,
  getAuthUrl,
  getTokensFromCode,
  getPlaylists
} from './youtube_service.js';
import {
  initScheduler,
  calculateRandomPublishTime,
  registerJob,
  cancelJob,
  triggerUpload
} from './scheduler.js';
import {
  FRONTEND_DIST,
  UPLOAD_DIR,
  ensureStorageDirs,
  getUploadUrl,
  removeStoredUpload,
  storedFileExists,
  toStoredPath
} from './storage_paths.js';
import { getOrCreateVideoPreviewPath } from './video_preview.js';

dotenv.config({ quiet: true });

// Tạo các thư mục lưu trữ uploads
ensureStorageDirs();

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 10240);
const SECRET_MASK = '********';

// Cấu hình CORS và JSON parser
app.use(cors());
app.use(express.json());

// Phục vụ tĩnh thư mục uploads (để frontend hiển thị ảnh thumbnail preview)
app.use('/uploads', express.static(UPLOAD_DIR));

// Cấu hình Multer để lưu video và thumbnail chất lượng gốc
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Giữ nguyên extension gốc
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024
  }
});

function toPublicSchedule(schedule) {
  const videoPreviewPath = schedule.thumbnailPath ? null : getOrCreateVideoPreviewPath(schedule.videoPath);

  return {
    ...schedule,
    videoUrl: schedule.videoPath ? getUploadUrl(schedule.videoPath) : null,
    videoPreviewUrl: videoPreviewPath ? getUploadUrl(videoPreviewPath) : null,
    thumbnailUrl: schedule.thumbnailPath ? getUploadUrl(schedule.thumbnailPath) : null,
    videoFileExists: storedFileExists(schedule.videoPath),
    thumbnailFileExists: schedule.thumbnailPath ? storedFileExists(schedule.thumbnailPath) : false
  };
}

function toPublicAccount(account) {
  return {
    id: account.id,
    name: account.name,
    avatar: account.avatar,
    tokenExpiry: account.tokenExpiry
  };
}

function toPublicConfig(config = {}) {
  return {
    clientId: config.clientId || '',
    clientSecret: config.clientSecret ? SECRET_MASK : '',
    redirectUri: config.redirectUri || 'http://localhost:3001/api/auth/callback'
  };
}

function isValidFutureDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

// Cấu hình cài đặt Google API ban đầu từ file cấu hình của hệ thống nếu có
async function loadConfig() {
  const db = await readDb();
  if (db.config) {
    configureApi(db.config.clientId, db.config.clientSecret, db.config.redirectUri);
  }
}
await loadConfig();

// ==================== ROUTERS API ====================

// --- CÀI ĐẶT API KEYS ---
app.get('/api/settings', async (req, res) => {
  const db = await readDb();
  res.json({
    isConfigured: isApiConfigured(),
    config: toPublicConfig(db.config)
  });
});

app.get('/api/health', async (req, res) => {
  const db = await readDb();
  const storage = getStorageInfo();
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    apiConfigured: isApiConfigured(),
    storage: {
      dataDir: storage.dataDir,
      dbFile: storage.dbFile,
      uploadDir: UPLOAD_DIR,
      frontendDist: FRONTEND_DIST,
      frontendDistExists: fs.existsSync(FRONTEND_DIST)
    },
    counts: {
      accounts: (db.accounts || []).length,
      schedules: (db.schedules || []).length,
      pendingSchedules: (db.schedules || []).filter(item => item.status === 'pending').length
    }
  });
});

app.post('/api/settings', async (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  const db = await readDb();
  const existingConfig = db.config || {};
  const nextClientSecret = clientSecret === SECRET_MASK
    ? existingConfig.clientSecret || ''
    : clientSecret || '';

  db.config = { clientId, clientSecret: nextClientSecret, redirectUri };
  await writeDb(db);
  configureApi(clientId, nextClientSecret, redirectUri);
  res.json({ success: true, isConfigured: isApiConfigured() });
});

// --- GOOGLE OAUTH2 FLOW ---
app.get('/api/auth/url', (req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mock login dùng khi chưa cấu hình Google API (cho phép chạy thử)
app.get('/api/auth/mock-login', async (req, res) => {
  try {
    const { tokens, channelInfo } = await getTokensFromCode(null);
    const newAccount = {
      id: channelInfo.id,
      name: channelInfo.title,
      avatar: channelInfo.avatar,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date
    };
    await saveAccount(newAccount);
    // Redirect về Frontend
    res.send('<script>window.opener.postMessage("oauth_success", "*"); window.close();</script>');
  } catch (error) {
    res.status(500).send(`Lỗi giả lập: ${error.message}`);
  }
});

// Callback nhận code OAuth2 từ Google chuyển về
app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Không nhận được mã ủy quyền OAuth Code.');
  }

  try {
    const { tokens, channelInfo } = await getTokensFromCode(code);
    const newAccount = {
      id: channelInfo.id,
      name: channelInfo.title,
      avatar: channelInfo.avatar,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date
    };
    await saveAccount(newAccount);
    // Trả về HTML chứa script gửi message báo cho cửa sổ chính rồi tự đóng popup
    res.send('<script>window.opener.postMessage("oauth_success", "*"); window.close();</script>');
  } catch (error) {
    console.error('Lỗi Callback OAuth:', error);
    res.status(500).send(`Xác thực thất bại: ${error.message}`);
  }
});

// --- QUẢN LÝ TÀI KHOẢN (ACCOUNTS) ---
app.get('/api/accounts', async (req, res) => {
  const accounts = await getAccounts();
  res.json(accounts.map(toPublicAccount));
});

app.delete('/api/accounts/:id', async (req, res) => {
  try {
    await deleteAccount(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- LẤY DANH SÁCH PLAYLIST CỦA TÀI KHOẢN ---
app.get('/api/accounts/:id/playlists', async (req, res) => {
  try {
    const { id } = req.params;
    const accounts = await getAccounts();
    const account = accounts.find(a => a.id === id);
    if (!account) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản để tải danh sách phát.' });
    }
    const playlists = await getPlaylists(account);
    res.json(playlists);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách phát:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- FILE UPLOAD ---
// Nhận upload đồng thời file video và file thumbnail
app.post('/api/upload', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), (req, res) => {
  try {
    const files = req.files;
    const response = {};

    if (files.video && files.video[0]) {
      response.videoPath = toStoredPath(files.video[0].path);
      response.videoOriginalName = files.video[0].originalname;
    }
    if (files.thumbnail && files.thumbnail[0]) {
      response.thumbnailPath = toStoredPath(files.thumbnail[0].path);
      // Trả thêm URL tương đối để hiển thị preview ở frontend
      response.thumbnailUrl = getUploadUrl(files.thumbnail[0].path);
    }

    res.json(response);
  } catch (error) {
    console.error('Lỗi upload file:', error);
    res.status(500).json({ error: 'Không thể upload file.' });
  }
});

// --- QUẢN LÝ LỊCH ĐĂNG (SCHEDULES) ---
app.get('/api/schedules', async (req, res) => {
  const schedules = await getSchedules();
  res.json(schedules.map(toPublicSchedule));
});

app.post('/api/schedules', async (req, res) => {
  try {
    const {
      accountId,
      title,
      description,
      videoPath,
      thumbnailPath,
      targetTime,
      scheduledDate,
      windowMinutes,
      madeForKids,
      privacyStatus,
      playlistId
    } = req.body;

    if (!accountId || !title || !videoPath || !targetTime || !scheduledDate) {
      return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin bắt buộc.' });
    }

    const normalizedVideoPath = toStoredPath(videoPath);
    const normalizedThumbnailPath = thumbnailPath ? toStoredPath(thumbnailPath) : null;
    if (!storedFileExists(normalizedVideoPath)) {
      return res.status(400).json({ error: 'Không tìm thấy file video đã upload trên server.' });
    }
    if (normalizedThumbnailPath && !storedFileExists(normalizedThumbnailPath)) {
      return res.status(400).json({ error: 'Không tìm thấy file thumbnail đã upload trên server.' });
    }

    // Tính toán thời gian đăng ngẫu nhiên
    const actualPublishTime = calculateRandomPublishTime(scheduledDate, targetTime, windowMinutes || 30);
    if (!isValidFutureDate(actualPublishTime)) {
      return res.status(400).json({ error: 'Thời gian đăng thực tế đã qua hoặc không hợp lệ. Vui lòng chọn ngày giờ trong tương lai.' });
    }

    const newSchedule = {
      id: uuidv4(),
      accountId,
      title,
      description: description || '',
      videoPath: normalizedVideoPath,
      thumbnailPath: normalizedThumbnailPath,
      targetTime,
      scheduledDate,
      windowMinutes: windowMinutes || 30,
      actualPublishTime: actualPublishTime.toISOString(),
      madeForKids: madeForKids ?? false,
      privacyStatus: privacyStatus || 'public',
      playlistId: playlistId || null,
      status: 'pending',
      log: 'Đã lên lịch đăng tự động ngẫu nhiên.',
      createdAt: new Date().toISOString()
    };

    const saved = await saveSchedule(newSchedule);

    // Kích hoạt bộ hẹn giờ node-schedule
    registerJob(saved.id, actualPublishTime);

    res.status(201).json(toPublicSchedule(saved));
  } catch (error) {
    console.error('Lỗi tạo lịch đăng:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getScheduleById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy lịch đăng cần sửa.' });
    }

    // Chỉ cho phép sửa khi chưa đăng thành công
    if (existing.status === 'success') {
      return res.status(400).json({ error: 'Video đã được đăng thành công, không thể chỉnh sửa.' });
    }

    const {
      title,
      description,
      videoPath,
      thumbnailPath,
      targetTime,
      scheduledDate,
      windowMinutes,
      madeForKids,
      privacyStatus,
      playlistId
    } = req.body;

    const normalizedVideoPath = videoPath !== undefined ? toStoredPath(videoPath) : existing.videoPath;
    const normalizedThumbnailPath = thumbnailPath !== undefined && thumbnailPath !== null
      ? toStoredPath(thumbnailPath)
      : thumbnailPath;

    if (normalizedVideoPath && !storedFileExists(normalizedVideoPath)) {
      return res.status(400).json({ error: 'Không tìm thấy file video đã upload trên server.' });
    }
    if (normalizedThumbnailPath && !storedFileExists(normalizedThumbnailPath)) {
      return res.status(400).json({ error: 'Không tìm thấy file thumbnail đã upload trên server.' });
    }

    const updated = {
      ...existing,
      title: title ?? existing.title,
      description: description ?? existing.description,
      videoPath: normalizedVideoPath,
      thumbnailPath: thumbnailPath !== undefined ? normalizedThumbnailPath : existing.thumbnailPath,
      madeForKids: madeForKids ?? existing.madeForKids,
      privacyStatus: privacyStatus ?? existing.privacyStatus,
      playlistId: playlistId !== undefined ? playlistId : existing.playlistId
    };

    // Nếu thay đổi ngày hoặc giờ đăng, tính lại thời gian đăng ngẫu nhiên
    if (
      (targetTime && targetTime !== existing.targetTime) ||
      (scheduledDate && scheduledDate !== existing.scheduledDate) ||
      (windowMinutes !== undefined && windowMinutes !== existing.windowMinutes)
    ) {
      const newTargetTime = targetTime || existing.targetTime;
      const newScheduledDate = scheduledDate || existing.scheduledDate;
      const newWindow = windowMinutes !== undefined ? windowMinutes : existing.windowMinutes;

      const actualPublishTime = calculateRandomPublishTime(newScheduledDate, newTargetTime, newWindow);
      if (!isValidFutureDate(actualPublishTime)) {
        return res.status(400).json({ error: 'Thời gian đăng thực tế đã qua hoặc không hợp lệ. Vui lòng chọn ngày giờ trong tương lai.' });
      }

      updated.targetTime = newTargetTime;
      updated.scheduledDate = newScheduledDate;
      updated.windowMinutes = newWindow;
      updated.actualPublishTime = actualPublishTime.toISOString();
      updated.status = 'pending';
      updated.log = 'Đã cập nhật giờ đăng mới (ngẫu nhiên).';

      // Hủy job cũ và lập lịch cho job mới
      cancelJob(id);
      registerJob(id, actualPublishTime);
    } else {
      // Nếu trạng thái lỗi thì cho phép khôi phục về pending khi cập nhật
      if (updated.status === 'failed') {
        if (!isValidFutureDate(new Date(updated.actualPublishTime))) {
          return res.status(400).json({ error: 'Lịch bị lỗi có thời gian đăng đã qua. Vui lòng chọn lại ngày giờ trước khi khôi phục.' });
        }
        updated.status = 'pending';
        updated.log = 'Đã khôi phục trạng thái chờ đăng sau khi chỉnh sửa.';
        registerJob(id, new Date(updated.actualPublishTime));
      }
    }

    const saved = await saveSchedule(updated);
    res.json(toPublicSchedule(saved));
  } catch (error) {
    console.error('Lỗi cập nhật lịch đăng:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    cancelJob(id); // Hủy lịch hẹn giờ ngầm
    const deleted = await deleteSchedule(id);

    // Xóa file local nếu có để tránh tràn dung lượng đĩa
    if (deleted) {
      try {
        removeStoredUpload(deleted.videoPath);
        removeStoredUpload(deleted.thumbnailPath);
      } catch (err) {
        console.error('Lỗi khi xóa file đĩa:', err.message);
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- THỰC HIỆN ĐĂNG NGAY LẬP TỨC (PUBLISH NOW - MANUAL) ---
app.post('/api/schedules/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getScheduleById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy video để đăng.' });
    }

    if (existing.status === 'success') {
      return res.status(400).json({ error: 'Video này đã được đăng thành công từ trước.' });
    }

    // Hủy job hẹn giờ ngầm vì ta thực hiện đăng luôn
    cancelJob(id);

    // Chạy upload đồng bộ/bất đồng bộ
    triggerUpload(id);

    res.json({ success: true, message: 'Đã kích hoạt tiến trình tải lên YouTube ngay lập tức.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  console.warn(`[SERVER] Chưa tìm thấy frontend build tại ${FRONTEND_DIST}. Chạy "npm run build" trong thư mục frontend để service phục vụ giao diện.`);
}

// Khởi chạy server Express
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`[SERVER] Đang chạy tại: http://localhost:${PORT}`);
  console.log(`[SERVER] Data dir: ${getStorageInfo().dataDir}`);
  console.log(`[SERVER] Upload dir: ${UPLOAD_DIR}`);
  
  // Khởi chạy Scheduler hàng đợi ngầm
  initScheduler();
});
