import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { saveAccount } from './db.js';
import { resolveStoredPath } from './storage_paths.js';

dotenv.config({ quiet: true });

// Các thông số OAuth2 lấy từ môi trường (hoặc sẽ lưu trong DB sau)
let GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
let GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
let GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/callback';

export function configureApi(clientId, clientSecret, redirectUri) {
  GOOGLE_CLIENT_ID = clientId;
  GOOGLE_CLIENT_SECRET = clientSecret;
  GOOGLE_REDIRECT_URI = redirectUri || 'http://localhost:3001/api/auth/callback';
}

export function isApiConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function allowMockAuth() {
  return process.env.ALLOW_MOCK_AUTH === 'true' || process.env.NODE_ENV !== 'production';
}

function isMockAccount(account) {
  return account?.id?.startsWith('UC_MOCK_CHANNEL');
}

function canUseMockMode(account = null) {
  return allowMockAuth() && (!isApiConfigured() || isMockAccount(account));
}

async function saveRefreshedTokens(account, tokens, context) {
  console.log(`Phát hiện token mới trong quá trình ${context}, đang cập nhật...`);
  if (tokens.refresh_token) {
    account.refreshToken = tokens.refresh_token;
  }
  if (tokens.access_token) {
    account.accessToken = tokens.access_token;
  }
  if (tokens.expiry_date) {
    account.tokenExpiry = tokens.expiry_date;
  }
  await saveAccount(account);
}

function getImageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp'
  };
  return mimeTypes[extension] || 'image/jpeg';
}

export function getOAuth2Client() {
  if (!isApiConfigured()) {
    throw new Error('Chưa cấu hình Google Client ID & Client Secret. Vui lòng cấu hình trong phần cài đặt.');
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

export function getAuthUrl() {
  if (!isApiConfigured()) {
    if (allowMockAuth()) {
      // Trả về url giả lập nếu đang ở mock mode
      return 'http://localhost:3001/api/auth/mock-login';
    }
    throw new Error('Service đang chạy production nên không cho phép Mock Mode. Vui lòng cấu hình Google API thật.');
  }
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile'
    ]
  });
}

export async function getTokensFromCode(code) {
  if (!isApiConfigured()) {
    if (!allowMockAuth()) {
      throw new Error('Service đang chạy production nên không cho phép Mock Mode. Vui lòng cấu hình Google API thật.');
    }
    // Mock login sinh tài khoản giả lập
    return {
      tokens: {
        access_token: 'mock_access_token_' + Date.now(),
        refresh_token: 'mock_refresh_token_' + Date.now(),
        expiry_date: Date.now() + 3600 * 1000
      },
      channelInfo: {
        id: 'UC_MOCK_CHANNEL_' + Math.floor(Math.random() * 1000),
        title: 'Kênh Mô Phỏng ' + (Math.floor(Math.random() * 2) + 1),
        avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60'
      }
    };
  }

  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const channelResponse = await youtube.channels.list({
    part: 'snippet',
    mine: true
  });

  if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
    throw new Error('Không tìm thấy kênh YouTube nào của tài khoản này.');
  }

  const channel = channelResponse.data.items[0];
  const channelInfo = {
    id: channel.id,
    title: channel.snippet.title,
    avatar: channel.snippet.thumbnails.default.url
  };

  return { tokens, channelInfo };
}

export async function getPlaylists(account) {
  if (canUseMockMode(account)) {
    // Mock playlists
    return [
      { id: 'mock_playlist_1', title: 'Danh sách phát Mô phỏng 1 (Âm nhạc)', description: 'Mô phỏng' },
      { id: 'mock_playlist_2', title: 'Danh sách phát Mô phỏng 2 (Vlog)', description: 'Mô phỏng' },
      { id: 'mock_playlist_3', title: 'Danh sách phát Mô phỏng 3 (Review)', description: 'Mô phỏng' }
    ];
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.tokenExpiry
  });

  // Tự động lưu access token mới khi nó được refresh
  oauth2Client.on('tokens', async (tokens) => {
    await saveRefreshedTokens(account, tokens, 'lấy danh sách phát');
  });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  
  let playlists = [];
  let nextPageToken = null;
  
  try {
    do {
      const response = await youtube.playlists.list({
        part: 'snippet',
        mine: true,
        maxResults: 50,
        pageToken: nextPageToken
      });
      
      if (response.data.items) {
        const pagePlaylists = response.data.items.map(item => ({
          id: item.id,
          title: item.snippet.title,
          description: item.snippet.description || ''
        }));
        playlists = playlists.concat(pagePlaylists);
      }
      
      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken);
  } catch (error) {
    console.error('Lỗi khi gọi API danh sách phát:', error.message);
    throw error;
  }

  return playlists;
}

export async function uploadVideo(account, videoDetails) {
  console.log(`Bắt đầu đăng video lên kênh: ${account.name} (ID: ${account.id})`);
  
  if (canUseMockMode(account)) {
    // Chế độ mô phỏng
    console.log('[MOCK MODE] Đang tải file lên...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Giả lập mất 5s để upload
    console.log('[MOCK MODE] Tải lên thành công! Video ID giả lập: mock_video_id_' + Date.now());
    return 'mock_video_id_' + Date.now();
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.tokenExpiry
  });

  // Tự động lưu access token mới khi nó được refresh
  oauth2Client.on('tokens', async (tokens) => {
    await saveRefreshedTokens(account, tokens, 'upload video');
  });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const resolvedVideoPath = resolveStoredPath(videoDetails.videoPath);

  if (!resolvedVideoPath || !fs.existsSync(resolvedVideoPath)) {
    throw new Error(`Không tìm thấy file video tại: ${videoDetails.videoPath}`);
  }

  const videoSize = fs.statSync(resolvedVideoPath).size;
  console.log(`Dung lượng video: ${(videoSize / (1024 * 1024)).toFixed(2)} MB`);

  const insertParams = {
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title: videoDetails.title,
        description: videoDetails.description,
        categoryId: '22', // People & Blogs
      },
      status: {
        privacyStatus: videoDetails.privacyStatus || 'public',
        selfDeclaredMadeForKids: videoDetails.madeForKids || false,
      },
    },
    media: {
      body: fs.createReadStream(resolvedVideoPath),
    },
  };

  const videoResponse = await youtube.videos.insert(insertParams);
  const videoId = videoResponse.data.id;
  console.log(`Đã đăng video thành công! Video ID: ${videoId}`);

  // Upload Thumbnail nếu có
  const resolvedThumbnailPath = resolveStoredPath(videoDetails.thumbnailPath);
  if (resolvedThumbnailPath && fs.existsSync(resolvedThumbnailPath)) {
    console.log(`Đang tải lên thumbnail từ: ${resolvedThumbnailPath}`);
    try {
      await youtube.thumbnails.set({
        videoId: videoId,
        media: {
          mimeType: getImageMimeType(resolvedThumbnailPath),
          body: fs.createReadStream(resolvedThumbnailPath),
        },
      });
      console.log('Tải lên thumbnail thành công!');
    } catch (thumbError) {
      console.error('Lỗi khi tải lên thumbnail:', thumbError.message);
    }
  }

  // Thêm video vào Danh sách phát (Playlist) nếu có yêu cầu
  if (videoDetails.playlistId) {
    if (canUseMockMode(account)) {
      console.log(`[MOCK MODE] Đang giả lập thêm video ID: ${videoId} vào danh sách phát: ${videoDetails.playlistId}`);
    } else {
      console.log(`Đang thêm video ID: ${videoId} vào danh sách phát: ${videoDetails.playlistId}`);
      try {
        await youtube.playlistItems.insert({
          part: 'snippet',
          requestBody: {
            snippet: {
              playlistId: videoDetails.playlistId,
              resourceId: {
                kind: 'youtube#video',
                videoId: videoId
              }
            }
          }
        });
        console.log('Thêm video vào danh sách phát thành công!');
      } catch (playlistError) {
        console.error('Lỗi khi thêm video vào danh sách phát:', playlistError.message);
      }
    }
  }

  return videoId;
}
