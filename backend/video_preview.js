import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { UPLOAD_DIR, resolveStoredPath, toStoredPath } from './storage_paths.js';

function getPreviewFilePath(videoPath) {
  const resolvedVideoPath = resolveStoredPath(videoPath);
  if (!resolvedVideoPath) {
    return null;
  }

  const parsed = path.parse(resolvedVideoPath);
  return path.join(UPLOAD_DIR, `${parsed.name}.preview.jpg`);
}

export function getOrCreateVideoPreviewPath(videoPath) {
  const resolvedVideoPath = resolveStoredPath(videoPath);
  if (!resolvedVideoPath || !fs.existsSync(resolvedVideoPath)) {
    return null;
  }

  const previewPath = getPreviewFilePath(videoPath);
  if (!previewPath) {
    return null;
  }

  if (fs.existsSync(previewPath)) {
    return toStoredPath(previewPath);
  }

  try {
    execFileSync('ffmpeg', [
      '-y',
      '-ss',
      '00:00:01',
      '-i',
      resolvedVideoPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:-1',
      '-q:v',
      '3',
      previewPath
    ], { stdio: 'ignore' });

    return fs.existsSync(previewPath) ? toStoredPath(previewPath) : null;
  } catch (error) {
    console.warn(`[VIDEO PREVIEW] Không thể tạo ảnh preview cho video: ${videoPath}`);
    return null;
  }
}
