import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DATA_DIR,
  UPLOAD_DIR,
  getUploadUrl,
  resolveStoredPath,
  toStoredPath
} from './storage_paths.js';

test('stores upload files as portable relative paths', () => {
  const uploadPath = path.join(UPLOAD_DIR, 'example.mp4');
  assert.equal(toStoredPath(uploadPath), 'uploads/example.mp4');
});

test('resolves portable upload paths under the data directory', () => {
  assert.equal(resolveStoredPath('uploads/example.mp4'), path.join(DATA_DIR, 'uploads', 'example.mp4'));
});

test('maps old Windows upload paths by basename when the local file exists', () => {
  const fileName = `path-test-${Date.now()}.mp4`;
  const localPath = path.join(UPLOAD_DIR, fileName);
  fs.writeFileSync(localPath, 'test');

  try {
    assert.equal(
      resolveStoredPath(`D:/Capcut/youtube_auto_scheduler/backend/data/uploads/${fileName}`),
      localPath
    );
  } finally {
    fs.unlinkSync(localPath);
  }
});

test('creates upload URLs from stored paths', () => {
  assert.equal(getUploadUrl('uploads/example.png'), '/uploads/example.png');
});
