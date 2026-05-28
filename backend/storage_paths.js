import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
export const BACKEND_DIR = path.dirname(__filename);
export const PROJECT_DIR = path.resolve(BACKEND_DIR, '..');

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(BACKEND_DIR, 'data');

export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(DATA_DIR, 'uploads');

export const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(DATA_DIR, 'db.json');

export const FRONTEND_DIST = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.join(PROJECT_DIR, 'frontend', 'dist');

function isWindowsAbsolutePath(filePath) {
  return /^[A-Za-z]:[\\/]/.test(filePath);
}

function isInsideDirectory(parentDir, childPath) {
  const relative = path.relative(parentDir, childPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function ensureStorageDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function toStoredPath(filePath) {
  if (!filePath) {
    return filePath;
  }

  const absolutePath = path.resolve(filePath);
  if (isInsideDirectory(UPLOAD_DIR, absolutePath)) {
    return `uploads/${path.basename(absolutePath)}`;
  }

  return filePath.replace(/\\/g, '/');
}

export function resolveStoredPath(storedPath) {
  if (!storedPath) {
    return storedPath;
  }

  const normalized = storedPath.replace(/\\/g, '/');
  if (normalized.startsWith('uploads/')) {
    return path.join(DATA_DIR, normalized);
  }

  if (isWindowsAbsolutePath(storedPath)) {
    const fallback = path.join(UPLOAD_DIR, path.basename(normalized));
    if (fs.existsSync(fallback)) {
      return fallback;
    }
  }

  if (path.isAbsolute(storedPath)) {
    return storedPath;
  }

  return path.resolve(BACKEND_DIR, storedPath);
}

export function getUploadUrl(storedPath) {
  if (!storedPath) {
    return null;
  }

  return `/uploads/${path.basename(storedPath.replace(/\\/g, '/'))}`;
}

export function storedFileExists(storedPath) {
  const resolved = resolveStoredPath(storedPath);
  return !!resolved && fs.existsSync(resolved);
}

export function removeStoredUpload(storedPath) {
  const resolved = resolveStoredPath(storedPath);
  if (!resolved || !fs.existsSync(resolved)) {
    return false;
  }

  if (!isInsideDirectory(UPLOAD_DIR, resolved)) {
    console.warn(`[STORAGE] Bỏ qua xóa file ngoài thư mục uploads: ${resolved}`);
    return false;
  }

  fs.unlinkSync(resolved);
  return true;
}
