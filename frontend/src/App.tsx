import React, { useState, useEffect } from 'react';

// Định nghĩa kiểu dữ liệu
interface Account {
  id: string;
  name: string;
  avatar: string;
  tokenExpiry?: number;
}

interface Schedule {
  id: string;
  accountId: string;
  title: string;
  description: string;
  videoPath: string;
  videoUrl?: string | null;
  videoPreviewUrl?: string | null;
  videoFileExists?: boolean;
  thumbnailPath: string | null;
  thumbnailUrl?: string | null; // dùng để hiển thị URL tương đối từ server
  thumbnailFileExists?: boolean;
  targetTime: string;
  scheduledDate: string;
  windowMinutes: number;
  actualPublishTime: string;
  madeForKids: boolean;
  privacyStatus: string;
  status: 'pending' | 'uploading' | 'success' | 'failed';
  log: string;
  videoId?: string;
  playlistId?: string | null;
  createdAt: string;
}

interface Playlist {
  id: string;
  title: string;
  description: string;
}

const APP_BASE_PATH = '/youtube_auto_schedule';
const viteEnv = (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string; VITE_APP_BASE_PATH?: string } }).env;
const configuredBasePath = viteEnv?.VITE_APP_BASE_PATH || APP_BASE_PATH;
const runtimeBasePath = window.location.pathname.startsWith(`${configuredBasePath}/`) || window.location.pathname === configuredBasePath
  ? configuredBasePath
  : '';
const API_BASE_URL = viteEnv?.VITE_API_BASE_URL
  || (window.location.port === '5173' ? 'http://localhost:3001' : `${window.location.origin}${runtimeBasePath}`);
const DEFAULT_SCHEDULE_IMAGE = 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=300&auto=format&fit=crop&q=60';
const IS_DEMO_MODE = new URLSearchParams(window.location.search).get('demo') === '1';
const DEMO_THUMBNAIL_1 = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#111827"/><circle cx="92" cy="90" r="42" fill="#4f46e5"/><rect x="150" y="60" width="120" height="16" rx="8" fill="#e5e7eb"/><rect x="150" y="86" width="92" height="12" rx="6" fill="#9ca3af"/><rect x="150" y="108" width="136" height="12" rx="6" fill="#6b7280"/></svg>')}`;
const DEMO_THUMBNAIL_2 = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#0f172a"/><polygon points="138,62 138,118 188,90" fill="#ef4444"/><rect x="80" y="130" width="160" height="10" rx="5" fill="#64748b"/></svg>')}`;
const DEMO_ACCOUNTS: Account[] = [
  { id: 'demo-channel-1', name: 'Demo Channel', avatar: DEMO_THUMBNAIL_1 },
  { id: 'demo-channel-2', name: 'Review Channel', avatar: DEMO_THUMBNAIL_2 }
];
const DEMO_SCHEDULES: Schedule[] = [
  {
    id: 'demo-schedule-1',
    accountId: 'demo-channel-1',
    title: 'Morning product short',
    description: 'A scheduled short prepared for the morning content slot.',
    videoPath: 'uploads/demo-video-1.mp4',
    videoUrl: null,
    videoPreviewUrl: DEMO_THUMBNAIL_1,
    videoFileExists: true,
    thumbnailPath: null,
    thumbnailUrl: null,
    thumbnailFileExists: false,
    targetTime: '19:00',
    scheduledDate: '2026-06-02',
    windowMinutes: 30,
    actualPublishTime: '2026-06-02T12:03:00.000Z',
    madeForKids: false,
    privacyStatus: 'public',
    status: 'pending',
    log: 'Ready to publish.',
    createdAt: '2026-05-28T00:00:00.000Z'
  },
  {
    id: 'demo-schedule-2',
    accountId: 'demo-channel-1',
    title: 'Evening story video',
    description: 'A longer upload queued for the evening publish window.',
    videoPath: 'uploads/demo-video-2.mp4',
    videoUrl: null,
    videoPreviewUrl: DEMO_THUMBNAIL_2,
    videoFileExists: true,
    thumbnailPath: null,
    thumbnailUrl: null,
    thumbnailFileExists: false,
    targetTime: '21:00',
    scheduledDate: '2026-06-03',
    windowMinutes: 20,
    actualPublishTime: '2026-06-03T14:08:00.000Z',
    madeForKids: false,
    privacyStatus: 'private',
    status: 'pending',
    log: 'Ready to publish.',
    createdAt: '2026-05-28T00:00:00.000Z'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create' | 'settings'>('dashboard');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isApiConfigured, setIsApiConfigured] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState<boolean>(false);
  
  // Cài đặt API
  const [settingsConfig, setSettingsConfig] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:3001/api/auth/callback'
  });
  
  // Trạng thái Form
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    videoFile: null as File | null,
    thumbnailFile: null as File | null,
    targetTime: '19:00',
    scheduledDate: new Date().toISOString().split('T')[0],
    windowMinutes: 30,
    notForKids: true, // Không dành cho trẻ con (mặc định tích)
    privacyStatus: 'public', // Mặc định công khai
    playlistId: '' // ID của danh sách phát được chọn
  });

  // Trạng thái Uploading file tại Form
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [videoPreviewName, setVideoPreviewName] = useState<string>('');
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string>('');
  const [tempVideoPath, setTempVideoPath] = useState<string>('');
  const [tempThumbnailPath, setTempThumbnailPath] = useState<string>('');

  // Trạng thái Modal Xác nhận
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    scheduleId: string | null;
    title: string;
  }>({
    show: false,
    scheduleId: null,
    title: ''
  });

  async function fetchAccounts() {
    if (IS_DEMO_MODE) {
      setAccounts(DEMO_ACCOUNTS);
      setActiveAccount(current => current || DEMO_ACCOUNTS[0].id);
      return DEMO_ACCOUNTS;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts`);
      const data = await res.json();
      setAccounts(data);
      setActiveAccount(current => current || data[0]?.id || null);
      return data;
    } catch (err) {
      console.error('Lỗi fetch accounts:', err);
      return [];
    }
  }

  async function fetchSchedules() {
    if (IS_DEMO_MODE) {
      setSchedules(DEMO_SCHEDULES);
      return DEMO_SCHEDULES;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/schedules`);
      const data = await res.json();
      setSchedules(data);
      return data;
    } catch (err) {
      console.error('Lỗi fetch schedules:', err);
      return [];
    }
  }

  async function fetchSettings() {
    if (IS_DEMO_MODE) {
      setIsApiConfigured(true);
      setSettingsConfig({
        clientId: '',
        clientSecret: '',
        redirectUri: 'https://your-domain.example/youtube_auto_schedule/api/auth/callback'
      });
      return null;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/settings`);
      const data = await res.json();
      setIsApiConfigured(data.isConfigured);
      setSettingsConfig(data.config);
      return data;
    } catch (err) {
      console.error('Lỗi fetch settings:', err);
      return null;
    }
  }

  async function fetchPlaylists(accountId: string) {
    if (IS_DEMO_MODE) {
      setPlaylists([
        { id: 'demo-playlist-1', title: 'Launch Queue', description: 'Demo playlist' },
        { id: 'demo-playlist-2', title: 'Weekly Uploads', description: 'Demo playlist' }
      ]);
      return;
    }

    setIsLoadingPlaylists(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/playlists`);
      if (!res.ok) {
        throw new Error('Lỗi tải danh sách phát');
      }
      const data = await res.json();
      setPlaylists(data);
    } catch (err) {
      console.error('Lỗi fetch playlists:', err);
      setPlaylists([]);
    } finally {
      setIsLoadingPlaylists(false);
    }
  }

  // Load danh sách dữ liệu từ Backend
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        await Promise.all([
          fetchAccounts(),
          fetchSchedules(),
          fetchSettings()
        ]);
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu ban đầu:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Tải danh sách playlist khi chuyển tài khoản hoạt động
  useEffect(() => {
    if (activeAccount) {
      Promise.resolve().then(() => fetchPlaylists(activeAccount));
    } else {
      Promise.resolve().then(() => setPlaylists([]));
    }
  }, [activeAccount]);

  // Click kết nối tài khoản mới
  const handleConnectAccount = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/url`);
      const data = await res.json();
      
      // Mở Popup OAuth
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      window.open(
        data.url,
        'OAuth YouTube Connect',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Nhận tin nhắn báo thành công từ popup
      const handleMessage = (event: MessageEvent) => {
        if (event.data === 'oauth_success') {
          fetchAccounts();
          window.removeEventListener('message', handleMessage);
        }
      };
      window.addEventListener('message', handleMessage);
    } catch (err) {
      alert('Không thể lấy URL ủy quyền: ' + err);
    }
  };

  // Xóa tài khoản liên kết
  const handleDeleteAccount = async (id: string, name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn ngắt kết nối kênh "${name}"? Mọi lịch đăng của kênh này sẽ bị xóa.`)) {
      return;
    }
    try {
      await fetch(`${API_BASE_URL}/api/accounts/${id}`, { method: 'DELETE' });
      const updatedAccounts = await fetchAccounts();
      fetchSchedules();
      if (activeAccount === id) {
        setActiveAccount(updatedAccounts[0]?.id || null);
      }
    } catch (err) {
      alert('Lỗi khi xóa tài khoản: ' + err);
    }
  };

  // Upload video & thumbnail lên server local
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'video' | 'thumbnail') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    // Cập nhật state UI
    if (type === 'video') {
      setFormData(prev => ({ ...prev, videoFile: file }));
      setVideoPreviewName(file.name);
    } else {
      setFormData(prev => ({ ...prev, thumbnailFile: file }));
      setThumbnailPreviewUrl(URL.createObjectURL(file));
    }

    // Tiến hành upload ngầm ngay lên server để lưu file
    const uploadForm = new FormData();
    uploadForm.append(type, file);

    setUploadProgress(10);
    try {
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: uploadForm
      });
      setUploadProgress(60);
      const data = await res.json();
      setUploadProgress(100);

      if (type === 'video') {
        setTempVideoPath(data.videoPath);
      } else {
        setTempThumbnailPath(data.thumbnailPath);
      }

      setTimeout(() => setUploadProgress(null), 1000);
    } catch (err) {
      alert('Lỗi tải file lên server local: ' + err);
      setUploadProgress(null);
    }
  };

  // Gửi Form tạo lịch đăng video mới
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) {
      alert('Vui lòng chọn hoặc thêm tài khoản để đăng video.');
      return;
    }
    if (!tempVideoPath) {
      alert('Vui lòng chờ tải video lên xong hoặc kéo thả video vào form.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: activeAccount,
          title: formData.title,
          description: formData.description,
          videoPath: tempVideoPath,
          thumbnailPath: tempThumbnailPath || null,
          targetTime: formData.targetTime,
          scheduledDate: formData.scheduledDate,
          windowMinutes: formData.windowMinutes,
          madeForKids: !formData.notForKids, // convert Not For Kids to MadeForKids
          privacyStatus: formData.privacyStatus,
          playlistId: formData.playlistId || null
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error);
      }

      // Reset Form
      setFormData({
        title: '',
        description: '',
        videoFile: null,
        thumbnailFile: null,
        targetTime: '19:00',
        scheduledDate: new Date().toISOString().split('T')[0],
        windowMinutes: 30,
        notForKids: true,
        privacyStatus: 'public',
        playlistId: ''
      });
      setVideoPreviewName('');
      setThumbnailPreviewUrl('');
      setTempVideoPath('');
      setTempThumbnailPath('');

      // Refresh data và chuyển về tab dashboard
      fetchSchedules();
      setActiveTab('dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert('Lỗi lên lịch: ' + message);
    }
  };

  // Xóa lịch đăng video
  const handleDeleteSchedule = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa lịch đăng này không? Video đã upload tạm thời trên đĩa sẽ bị xóa.')) {
      return;
    }
    try {
      await fetch(`${API_BASE_URL}/api/schedules/${id}`, { method: 'DELETE' });
      fetchSchedules();
    } catch (err) {
      alert('Lỗi xóa lịch: ' + err);
    }
  };

  // Mở Modal Xác nhận Đăng ngay
  const triggerPublishNow = (id: string, title: string) => {
    setConfirmModal({
      show: true,
      scheduleId: id,
      title: title
    });
  };

  // Xác nhận đăng video lên Youtube ngay lập tức
  const handleConfirmPublishNow = async () => {
    const id = confirmModal.scheduleId;
    if (!id) return;

    setConfirmModal(prev => ({ ...prev, show: false }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/schedules/${id}/publish`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        fetchSchedules(); // load lại để cập nhật trạng thái uploading
      } else {
        alert('Lỗi kích hoạt: ' + data.error);
      }
    } catch (err) {
      alert('Lỗi: ' + err);
    }
  };

  // Cập nhật API Credentials cài đặt
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsConfig)
      });
      const data = await res.json();
      if (data.success) {
        setIsApiConfigured(data.isConfigured);
        alert('Đã lưu cấu hình Google API thành công!');
      }
    } catch (err) {
      alert('Lỗi lưu cấu hình: ' + err);
    }
  };

  // Lọc danh sách lịch đăng theo tài khoản đang chọn bên Sidebar
  const filteredSchedules = schedules.filter(s => s.accountId === activeAccount);

  const getAccountAvatar = (accountId: string) => {
    return accounts.find(account => account.id === accountId)?.avatar || DEFAULT_SCHEDULE_IMAGE;
  };

  const getScheduleThumbnailUrl = (schedule: Schedule) => {
    return schedule.thumbnailUrl && schedule.thumbnailFileExists !== false
      ? getPublicAssetUrl(schedule.thumbnailUrl)
      : null;
  };

  const getScheduleVideoUrl = (schedule: Schedule) => {
    return schedule.videoUrl && schedule.videoFileExists !== false
      ? getPublicAssetUrl(schedule.videoUrl)
      : null;
  };

  const getScheduleVideoPreviewUrl = (schedule: Schedule) => {
    return schedule.videoPreviewUrl && schedule.videoFileExists !== false
      ? getPublicAssetUrl(schedule.videoPreviewUrl)
      : null;
  };

  const getPublicAssetUrl = (url: string) => {
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    return `${API_BASE_URL}${url}`;
  };

  // Tính khoảng giờ random dự kiến để hiển thị lên Form UI
  const getExpectedRandomRange = () => {
    const [h, m] = formData.targetTime.split(':').map(Number);
    const half = Math.floor(formData.windowMinutes / 2);
    
    const dMin = new Date();
    dMin.setHours(h, m - half, 0, 0);
    const dMax = new Date();
    dMax.setHours(h, m + half, 0, 0);

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(dMin.getHours())}:${pad(dMin.getMinutes())} - ${pad(dMax.getHours())}:${pad(dMax.getMinutes())}`;
  };

  if (isLoading) {
    return (
      <div className="app-container">
        {/* 1. LEFT SIDEBAR SKELETON */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <span className="logo-icon-svg">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </span>
            <span className="logo-text">YT AutoPilot</span>
          </div>

          <div className="account-section">
            <div className="section-label">Các kênh quản lý</div>
            <div className="skeleton-sidebar">
              <div className="skeleton-bar" style={{ height: '88px', borderRadius: 'var(--radius-lg)' }}></div>
              <div className="skeleton-bar" style={{ height: '88px', borderRadius: 'var(--radius-lg)' }}></div>
              <div className="skeleton-bar" style={{ height: '48px', borderRadius: 'var(--radius-md)', marginTop: '4px' }}></div>
            </div>
          </div>

          <div className="account-section" style={{ marginTop: 'auto' }}>
            <div className="section-label">Bảng điều khiển</div>
            <div className="skeleton-sidebar">
              <div className="skeleton-bar" style={{ height: '38px', borderRadius: '8px' }}></div>
              <div className="skeleton-bar" style={{ height: '38px', borderRadius: '8px' }}></div>
              <div className="skeleton-bar" style={{ height: '38px', borderRadius: '8px' }}></div>
            </div>
          </div>
        </aside>

        {/* 2. RIGHT MAIN CONTENT PANEL SKELETON */}
        <main className="main-content">
          <div className="schedule-list-section">
            <div className="dashboard-header" style={{ borderBottom: 'none', marginBottom: '16px' }}>
              <div className="header-title-section" style={{ width: '60%' }}>
                <div className="skeleton-bar" style={{ height: '28px', width: '40%', marginBottom: '8px' }}></div>
                <div className="skeleton-bar" style={{ height: '16px', width: '80%' }}></div>
              </div>
              <div className="header-actions" style={{ gap: '10px' }}>
                <div className="skeleton-bar" style={{ height: '36px', width: '90px', borderRadius: '8px' }}></div>
                <div className="skeleton-bar" style={{ height: '36px', width: '150px', borderRadius: '8px' }}></div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
              <div className="skeleton-bar" style={{ height: '20px', width: '120px', marginBottom: '4px' }}></div>
              <div className="skeleton-bar" style={{ height: '114px', borderRadius: 'var(--radius-lg)' }}></div>
              <div className="skeleton-bar" style={{ height: '114px', borderRadius: 'var(--radius-lg)' }}></div>
              <div className="skeleton-bar" style={{ height: '114px', borderRadius: 'var(--radius-lg)' }}></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* 1. LEFT SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon-svg">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </span>
          <span className="logo-text">YT AutoPilot</span>
        </div>

        {/* Trình chọn Tài khoản (Channel Selector) */}
        <div className="account-section">
          <div className="section-label">Các kênh quản lý</div>
          <div className="account-selector">
            {accounts.map(acc => (
              <div 
                key={acc.id} 
                className={`account-item ${activeAccount === acc.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveAccount(acc.id);
                  setActiveTab('dashboard');
                }}
              >
                <img src={acc.avatar} alt={acc.name} className="account-avatar" />
                <div className="account-info">
                  <div className="account-name">{acc.name}</div>
                  <div className="account-status">Hoạt động</div>
                </div>
                <button 
                  className="upload-remove" 
                  title="Ngắt kết nối"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAccount(acc.id, acc.name);
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            ))}
            
            <button className="btn-add-account" onClick={handleConnectAccount}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Kết nối kênh mới
            </button>
          </div>
        </div>

        {/* Menu Điều hướng */}
        <div className="account-section" style={{ marginTop: 'auto' }}>
          <div className="section-label">Bảng điều khiển</div>
          <nav className="sidebar-menu">
            <div 
              className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9"></rect>
                <rect x="14" y="3" width="7" height="5"></rect>
                <rect x="14" y="12" width="7" height="9"></rect>
                <rect x="3" y="16" width="7" height="5"></rect>
              </svg>
              Lịch trình & Lịch sử
            </div>
            
            <div 
              className={`menu-item ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => setActiveTab('create')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"></path>
              </svg>
              Lên lịch video mới
            </div>

            <div 
              className={`menu-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Cấu hình Google API
            </div>
          </nav>
        </div>
      </aside>

      {/* 2. RIGHT MAIN CONTENT PANEL */}
      <main className="main-content">
        
        {/* Banner Mô phỏng Mock Mode (Nếu chưa cấu hình API Keys) */}
        {!isApiConfigured && (
          <div className="banner-alert">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>⚙️</span>
              <span>
                <strong>Chế độ Mô phỏng (Mock Mode):</strong> Cấu hình Google API chưa kích hoạt. Bạn vẫn có thể kiểm thử đầy đủ các chức năng lập lịch của ứng dụng một cách bình thường.
              </span>
            </div>
            <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '12px', boxShadow: 'none' }} onClick={() => setActiveTab('settings')}>Cấu hình ngay</button>
          </div>
        )}

        {/* TAB 1: DASHBOARD LIST OF SCHEDULES */}
        {activeTab === 'dashboard' && (
          <div className="schedule-list-section">
            <div className="dashboard-header">
              <div className="header-title-section">
                <h1>Lịch trình Đăng Video</h1>
                <p>
                  {activeAccount 
                    ? `Đang quản lý nội dung cho kênh: ${accounts.find(a => a.id === activeAccount)?.name || ''}` 
                    : 'Hãy kết nối kênh YouTube để bắt đầu lập lịch tự động.'}
                </p>
              </div>
              <div className="header-actions">
                <button className="btn-secondary" onClick={fetchSchedules}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px' }}>
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                  </svg>
                  Làm mới
                </button>
                {activeAccount && (
                  <button className="btn-primary" onClick={() => setActiveTab('create')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Lên lịch video mới
                  </button>
                )}
              </div>
            </div>

            <div className="list-header" style={{ marginTop: '8px' }}>
              <h2>Danh sách Video</h2>
            </div>

            {!activeAccount ? (
              <div className="empty-state-card">
                <svg className="empty-svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M23 7a2 2 0 0 0-2-2h-4l-3-3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"></path>
                  <polygon points="12 11 17 11 17 16 12 16 12 11"></polygon>
                </svg>
                <h3>Chưa kết nối tài khoản YouTube nào</h3>
                <p>
                  Vui lòng liên kết tài khoản YouTube của bạn từ menu bên trái để bắt đầu tạo hàng đợi tự động.
                </p>
                <button className="btn-primary" style={{ marginTop: '8px' }} onClick={handleConnectAccount}>Liên kết tài khoản</button>
              </div>
            ) : filteredSchedules.length === 0 ? (
              <div className="empty-state-card">
                <svg className="empty-svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                  <circle cx="12" cy="16" r="1"></circle>
                  <circle cx="8" cy="16" r="1"></circle>
                  <circle cx="16" cy="16" r="1"></circle>
                </svg>
                <h3>Chưa có video lập lịch nào cho kênh này</h3>
                <p>
                  Bạn có thể lên lịch đăng video gốc ngay bây giờ với cơ chế giờ xuất bản ngẫu nhiên tiện lợi.
                </p>
                <button className="btn-primary" style={{ marginTop: '8px' }} onClick={() => setActiveTab('create')}>Lên lịch video ngay</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredSchedules.map(sched => {
                  const thumbnailUrl = getScheduleThumbnailUrl(sched);
                  const videoPreviewUrl = getScheduleVideoPreviewUrl(sched);
                  const videoUrl = getScheduleVideoUrl(sched);

                  return (
                  <div key={sched.id} className={`schedule-row status-${sched.status}`}>
                    {/* Trạng thái thanh màu bên trái */}
                    <div className="status-indicator-bar" />

                    {/* Thumbnail video */}
                    {thumbnailUrl ? (
                      <img 
                        src={thumbnailUrl}
                        alt={`Thumbnail của ${sched.title}`}
                        className="row-thumbnail" 
                        onError={(event) => {
                          const image = event.currentTarget;
                          if (image.dataset.fallback === 'default') {
                            return;
                          }
                          if (image.dataset.fallback === 'avatar') {
                            image.dataset.fallback = 'default';
                            image.src = DEFAULT_SCHEDULE_IMAGE;
                            return;
                          }
                          image.dataset.fallback = 'avatar';
                          image.src = getAccountAvatar(sched.accountId);
                        }}
                      />
                    ) : videoPreviewUrl ? (
                      <img
                        src={videoPreviewUrl}
                        alt={`Ảnh từ video ${sched.title}`}
                        className="row-thumbnail"
                        onError={(event) => {
                          const image = event.currentTarget;
                          if (image.dataset.fallback === 'default') {
                            return;
                          }
                          if (image.dataset.fallback === 'avatar') {
                            image.dataset.fallback = 'default';
                            image.src = DEFAULT_SCHEDULE_IMAGE;
                            return;
                          }
                          image.dataset.fallback = 'avatar';
                          image.src = getAccountAvatar(sched.accountId);
                        }}
                      />
                    ) : videoUrl ? (
                      <video
                        src={`${videoUrl}#t=0.1`}
                        className="row-thumbnail"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={getAccountAvatar(sched.accountId)}
                        alt={`Ảnh đại diện kênh ${accounts.find(account => account.id === sched.accountId)?.name || ''}`}
                        className="row-thumbnail"
                        onError={(event) => {
                          event.currentTarget.src = DEFAULT_SCHEDULE_IMAGE;
                        }}
                      />
                    )}

                    {/* Tiêu đề & mô tả */}
                    <div className="row-main-info">
                      <div className="row-title" title={sched.title}>{sched.title}</div>
                      <div className="row-desc" title={sched.description}>{sched.description || 'Không có mô tả cho video này.'}</div>
                      <div className="row-meta">
                        <span className="badge badge-privacy">{sched.privacyStatus === 'public' ? 'Công khai' : 'Riêng tư'}</span>
                        <span className="badge badge-kids">{sched.madeForKids ? 'Dành cho trẻ em' : 'Không dành cho trẻ em'}</span>
                        {sched.playlistId && (
                          <span className="badge badge-playlist" style={{ backgroundColor: 'var(--color-info-bg)', color: 'var(--color-info)' }} title={playlists.find(p => p.id === sched.playlistId)?.title || sched.playlistId}>
                            📁 {playlists.find(p => p.id === sched.playlistId)?.title || `Playlist: ${sched.playlistId}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Lịch trình thời gian */}
                    <div className="row-schedule-box">
                      <span className="sched-label">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '3px', verticalAlign: 'middle' }}>
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        Ngày cài đặt
                      </span>
                      <span className="sched-time">{sched.scheduledDate}</span>
                      <span className="sched-label" style={{ marginTop: '4px' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '3px', verticalAlign: 'middle' }}>
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        Giờ ngẫu nhiên
                      </span>
                      <span className="sched-random-range">
                        {new Date(sched.actualPublishTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>

                    {/* Trạng thái Badge nhỏ nhắn */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '120px' }}>
                      <span className={`status-badge status-badge-${sched.status}`}>
                        {sched.status === 'pending' && '🕒 Chờ đăng'}
                        {sched.status === 'uploading' && '⚙️ Đang đăng'}
                        {sched.status === 'success' && '✅ Hoàn thành'}
                        {sched.status === 'failed' && '❌ Thất bại'}
                      </span>
                      {sched.status === 'failed' && (
                        <span style={{ fontSize: '11px', color: 'var(--color-failed)', marginTop: '4px', textAlign: 'center', maxWidth: '110px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={sched.log}>
                          {sched.log}
                        </span>
                      )}
                      {sched.status === 'success' && sched.videoId && (
                        <a 
                          href={`https://youtu.be/${sched.videoId}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          style={{ fontSize: '11px', color: 'var(--accent-indigo)', marginTop: '4px', textDecoration: 'underline' }}
                        >
                          Xem video
                        </a>
                      )}
                    </div>

                    {/* Nút hành động */}
                    <div className="row-actions">
                      {sched.status !== 'success' && sched.status !== 'uploading' && (
                        <button 
                          className="icon-btn icon-btn-publish" 
                          title="Đăng video ngay bây giờ"
                          onClick={() => triggerPublishNow(sched.id, sched.title)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                          </svg>
                        </button>
                      )}
                      <button 
                        className="icon-btn icon-btn-delete" 
                        title="Xóa video khỏi lịch"
                        onClick={() => handleDeleteSchedule(sched.id)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CREATE SCHEDULE FORM */}
        {activeTab === 'create' && (
          <div className="form-panel">
            <div className="dashboard-header">
              <div className="header-title-section">
                <h1>Lên lịch Video Mới</h1>
                <p>Cài đặt thông tin chi tiết và tính toán khung giờ đăng ngẫu nhiên cho kênh của bạn.</p>
              </div>
              <button className="btn-secondary" onClick={() => setActiveTab('dashboard')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px' }}>
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Quay lại
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit}>
              <div className="form-grid">
                
                {/* Cột trái: Tải file & Metadata */}
                <div className="form-left-col">
                  <div className="form-card">
                    {/* File Video Input */}
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label>File video gốc * <span>(Sẽ tải lên với chất lượng gốc không bị nén)</span></label>
                      <div 
                        className="file-dropzone" 
                        onClick={() => document.getElementById('video-input')?.click()}
                      >
                        {tempVideoPath ? (
                          <div className="upload-success-preview">
                            <span className="icon">🎥</span>
                            <span className="upload-filename">{videoPreviewName}</span>
                            <span className="badge badge-kids" style={{ marginLeft: 'auto', backgroundColor: '#d1fae5', color: '#065f46' }}>Đã lưu tạm</span>
                          </div>
                        ) : (
                          <>
                            <div className="dropzone-icon">
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                              </svg>
                            </div>
                            <div className="dropzone-text">Click chọn hoặc kéo thả video vào đây</div>
                            <div className="dropzone-subtext">Hỗ trợ MP4, MOV, AVI... chất lượng gốc tối đa 1GB</div>
                          </>
                        )}
                        <input 
                          id="video-input" 
                          type="file" 
                          accept="video/*" 
                          style={{ display: 'none' }} 
                          onChange={(e) => handleFileChange(e, 'video')}
                        />
                      </div>
                    </div>

                    {/* Thanh tiến trình Uploading */}
                    {uploadProgress !== null && (
                      <div style={{ marginTop: '-8px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <span>Đang lưu file video lên server...</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--accent-glow)', transition: 'width 0.2s' }} />
                        </div>
                      </div>
                    )}

                    {/* Title */}
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label>Tiêu đề video *</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        required
                        placeholder="Nhập tiêu đề video (tối đa 100 ký tự)"
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      />
                    </div>

                    {/* Description */}
                    <div className="form-group">
                      <label>Mô tả chi tiết</label>
                      <textarea 
                        className="form-control" 
                        placeholder="Nhập phần nội dung mô tả đi kèm video..."
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Cột phải: Thumbnail & Cài đặt thời gian */}
                <div className="form-right-col">
                  <div className="form-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Thumbnail File Input */}
                    <div className="form-group">
                      <label>Ảnh đại diện (Thumbnail)</label>
                      <div 
                        className="file-dropzone" 
                        style={{ padding: thumbnailPreviewUrl ? '6px' : '20px' }}
                        onClick={() => document.getElementById('thumb-input')?.click()}
                      >
                        {thumbnailPreviewUrl ? (
                          <div style={{ position: 'relative', width: '100%', height: '100px' }}>
                            <img src={thumbnailPreviewUrl} alt="Thumbnail Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }} />
                            <button 
                              type="button"
                              className="upload-remove" 
                              style={{ position: 'absolute', right: '6px', top: '6px', background: 'rgba(15,23,42,0.8)', width: '20px', height: '20px', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setThumbnailPreviewUrl('');
                                setTempThumbnailPath('');
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="dropzone-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <polyline points="21 15 16 10 5 21"></polyline>
                              </svg>
                            </div>
                            <div className="dropzone-text" style={{ fontSize: '12px' }}>Click tải ảnh nền</div>
                          </>
                        )}
                        <input 
                          id="thumb-input" 
                          type="file" 
                          accept="image/*" 
                          style={{ display: 'none' }} 
                          onChange={(e) => handleFileChange(e, 'thumbnail')}
                        />
                      </div>
                    </div>

                    {/* Danh sách phát (Playlist) */}
                    <div className="form-group">
                      <label>Danh sách phát (Playlist) {isLoadingPlaylists && <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '11px', marginLeft: '6px' }}>(Đang tải...)</span>}</label>
                      <select 
                        className="form-control"
                        value={formData.playlistId}
                        onChange={(e) => setFormData(prev => ({ ...prev, playlistId: e.target.value }))}
                        disabled={isLoadingPlaylists}
                      >
                        <option value="">-- Không chọn (Đăng ngoài danh sách phát) --</option>
                        {playlists.map(pl => (
                          <option key={pl.id} value={pl.id}>
                            {pl.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Lập lịch ngày & giờ */}
                    <div className="schedule-form-row">
                      <div className="form-group">
                        <label>Ngày đăng</label>
                        <input 
                          type="date" 
                          className="form-control" 
                          required
                          value={formData.scheduledDate}
                          onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Giờ đăng mẫu</label>
                        <input 
                          type="time" 
                          className="form-control" 
                          required
                          value={formData.targetTime}
                          onChange={(e) => setFormData(prev => ({ ...prev, targetTime: e.target.value }))}
                        />
                      </div>
                    </div>

                    {/* Khoảng lệch ngẫu nhiên */}
                    <div className="form-group">
                      <label>Khoảng ngẫu nhiên (Offset)</label>
                      <select 
                        className="form-control"
                        value={formData.windowMinutes}
                        onChange={(e) => setFormData(prev => ({ ...prev, windowMinutes: Number(e.target.value) }))}
                      >
                        <option value={10}>10 phút (±5m)</option>
                        <option value={20}>20 phút (±10m)</option>
                        <option value={30}>30 phút (±15m) [Mặc định]</option>
                        <option value={60}>60 phút (±30m)</option>
                        <option value={120}>120 phút (±60m)</option>
                      </select>
                      <div className="random-indicator-box">
                        🎲 Khung giờ đăng ngẫu nhiên dự kiến:<br />
                        <strong>{getExpectedRandomRange()}</strong>
                      </div>
                    </div>

                    {/* Đối tượng người xem - Segmented Control */}
                    <div className="form-group">
                      <label>Đối tượng người xem</label>
                      <div className="segmented-control">
                        <button 
                          type="button" 
                          className={`segmented-tab ${formData.notForKids ? 'active' : ''}`}
                          onClick={() => setFormData(prev => ({ ...prev, notForKids: true }))}
                        >
                          Không dành cho trẻ em
                        </button>
                        <button 
                          type="button" 
                          className={`segmented-tab ${!formData.notForKids ? 'active' : ''}`}
                          onClick={() => setFormData(prev => ({ ...prev, notForKids: false }))}
                        >
                          Dành cho trẻ em
                        </button>
                      </div>
                    </div>

                    {/* Chế độ Công khai / Riêng tư - Segmented Control */}
                    <div className="form-group">
                      <label>Quyền riêng tư</label>
                      <div className="segmented-control">
                        <button 
                          type="button" 
                          className={`segmented-tab ${formData.privacyStatus === 'public' ? 'active' : ''}`}
                          onClick={() => setFormData(prev => ({ ...prev, privacyStatus: 'public' }))}
                        >
                          Công khai
                        </button>
                        <button 
                          type="button" 
                          className={`segmented-tab ${formData.privacyStatus === 'private' ? 'active' : ''}`}
                          onClick={() => setFormData(prev => ({ ...prev, privacyStatus: 'private' }))}
                        >
                          Riêng tư (Private)
                        </button>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button 
                      type="submit" 
                      className="btn-primary" 
                      style={{ width: '100%', marginTop: '6px', height: '44px', justifyContent: 'center' }}
                    >
                      ⏰ Lưu và lên lịch ngẫu nhiên
                    </button>
                  </div>
                </div>

              </div>
            </form>
          </div>
        )}

        {/* TAB 3: SETTINGS GOOGLE API CREDENTIALS */}
        {activeTab === 'settings' && (
          <div className="form-panel">
            <div className="dashboard-header">
              <div className="header-title-section">
                <h1>Cấu hình Google API Credentials</h1>
                <p>Nhập Client ID và Secret để kích hoạt kết nối OAuth và đăng thật lên các kênh YouTube.</p>
              </div>
            </div>

            <div className="form-card" style={{ maxWidth: '800px' }}>
              <form onSubmit={handleSaveSettings} className="settings-box">
                <div className="form-group">
                  <label>Google API Client ID</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="Nhập Client ID của Google Cloud Project"
                    value={settingsConfig.clientId}
                    onChange={(e) => setSettingsConfig(prev => ({ ...prev, clientId: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label>Google API Client Secret</label>
                  <input 
                    type="password" 
                    className="form-control"
                    placeholder="Nhập Client Secret"
                    value={settingsConfig.clientSecret}
                    onChange={(e) => setSettingsConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label>OAuth Redirect URI <span>(Cần trùng khớp trong Google Cloud Console)</span></label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="http://localhost:3001/api/auth/callback"
                    value={settingsConfig.redirectUri}
                    onChange={(e) => setSettingsConfig(prev => ({ ...prev, redirectUri: e.target.value }))}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button type="submit" className="btn-primary">
                    💾 Lưu Cấu hình
                  </button>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={() => {
                      setSettingsConfig({
                        clientId: '',
                        clientSecret: '',
                        redirectUri: 'http://localhost:3001/api/auth/callback'
                      });
                    }}
                  >
                    Chạy Mock Mode (Mô phỏng)
                  </button>
                </div>
              </form>

              <div style={{ marginTop: '28px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px', fontSize: '14px', fontWeight: '600' }}>Các bước lấy thông tin cấu hình từ Google Cloud Console:</h3>
                <ol style={{ paddingLeft: '18px' }}>
                  <li>Truy cập <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-indigo)', fontWeight: '600' }}>Google Cloud Console</a> và tạo mới 1 dự án.</li>
                  <li>Tìm kiếm và kích hoạt thư viện **YouTube Data API v3**.</li>
                  <li>Cấu hình màn hình **OAuth consent screen** chọn loại External.</li>
                  <li>Vào thẻ **Credentials**, bấm **Create Credentials** và chọn **OAuth client ID** (Loại "Web application").</li>
                  <li>Trong ô **Authorized redirect URIs**, dán đúng link chuyển hướng sau: <br />
                    <code>http://localhost:3001/api/auth/callback</code>
                  </li>
                  <li>Nhận được Client ID và Client Secret, điền vào form trên và lưu lại. Sau đó bạn có thể liên kết tài khoản thật ở sidebar.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* 3. CONFIRMATION MODAL (PUBLISH NOW) */}
      {confirmModal.show && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Xác nhận đăng thủ công</h3>
            </div>
            <div className="modal-body">
              <p>
                Bạn có chắc chắn muốn đăng ngay video <strong>"{confirmModal.title}"</strong> lên kênh YouTube đã chọn mà không cần chờ đến giờ lập lịch ngẫu nhiên?
              </p>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={() => setConfirmModal({ show: false, scheduleId: null, title: '' })}
              >
                Hủy bỏ
              </button>
              <button 
                className="btn-primary" 
                style={{ background: 'var(--accent-glow)' }}
                onClick={handleConfirmPublishNow}
              >
                Xác nhận đăng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
