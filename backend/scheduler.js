import schedule from 'node-schedule';
import { getAccounts, getScheduleById, saveSchedule } from './db.js';
import { uploadVideo } from './youtube_service.js';

// Lưu các job đang chạy trong bộ nhớ: { [scheduleId]: Job }
const activeJobs = {};

/**
 * Hàm tính thời gian đăng ngẫu nhiên xung quanh giờ mục tiêu
 * @param {string} dateStr Định dạng 'YYYY-MM-DD'
 * @param {string} timeStr Định dạng 'HH:MM'
 * @param {number} windowMinutes Độ rộng khoảng ngẫu nhiên (phút)
 * @returns {Date}
 */
export function calculateRandomPublishTime(dateStr, timeStr, windowMinutes = 30) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

  // Khoảng lệch ngẫu nhiên +/- một nửa của window
  const normalizedWindow = Math.max(0, Number(windowMinutes) || 0);
  const halfWindow = Math.floor(normalizedWindow / 2);
  const minOffsetMs = -halfWindow * 60 * 1000;
  const maxOffsetMs = halfWindow * 60 * 1000;

  const randomOffsetMs = Math.floor(Math.random() * (maxOffsetMs - minOffsetMs + 1)) + minOffsetMs;
  return new Date(targetDate.getTime() + randomOffsetMs);
}

/**
 * Khởi động tiến trình chạy ngầm
 * Bấm chạy lại các lịch đăng video đang chờ (pending) và có thời gian đăng trong tương lai
 */
export async function initScheduler() {
  console.log('--------------------------------------------------');
  console.log('[SCHEDULER] Đang khởi động hàng đợi đăng video...');
  
  try {
    const db = await import('./db.js');
    const schedules = await db.getSchedules();
    const pendingSchedules = schedules.filter(s => s.status === 'pending');

    let scheduledCount = 0;
    for (const item of pendingSchedules) {
      const publishTime = new Date(item.actualPublishTime);
      
      // Nếu thời gian đăng đã qua nhưng bot tắt, ta kiểm tra và xử lý
      if (publishTime.getTime() <= Date.now()) {
        console.log(`[SCHEDULER] Lịch đăng ID: ${item.id} (${item.title}) đã qua giờ khi offline. Đang tự động đăng bù...`);
        // Chạy bất đồng bộ để tránh chặn tiến trình khởi động
        triggerUpload(item.id);
      } else {
        // Lập lịch đăng trong tương lai
        registerJob(item.id, publishTime);
        scheduledCount++;
      }
    }
    console.log(`[SCHEDULER] Khởi động thành công! Đã lên lịch đăng cho ${scheduledCount} video.`);
  } catch (error) {
    console.error('[SCHEDULER] Lỗi khởi tạo scheduler:', error);
  }
  console.log('--------------------------------------------------');
}

/**
 * Đăng ký một Job lập lịch trong bộ nhớ
 */
export function registerJob(scheduleId, publishTime) {
  if (!(publishTime instanceof Date) || Number.isNaN(publishTime.getTime())) {
    console.error(`[SCHEDULER] Không thể hẹn giờ vì thời gian không hợp lệ cho Schedule: ${scheduleId}`);
    return null;
  }

  if (publishTime.getTime() <= Date.now()) {
    console.warn(`[SCHEDULER] Bỏ qua hẹn giờ quá khứ cho Schedule: ${scheduleId}`);
    return null;
  }

  // Hủy job cũ nếu có
  if (activeJobs[scheduleId]) {
    activeJobs[scheduleId].cancel();
  }

  console.log(`[SCHEDULER] Đã kích hoạt hẹn giờ cho Schedule: ${scheduleId} vào lúc: ${publishTime.toLocaleString()}`);
  
  const job = schedule.scheduleJob(publishTime, async () => {
    console.log(`[SCHEDULER] Đến giờ đăng ngẫu nhiên! Kích hoạt upload cho ID: ${scheduleId}`);
    delete activeJobs[scheduleId]; // Xóa khỏi danh sách active
    await triggerUpload(scheduleId);
  });

  if (job) {
    activeJobs[scheduleId] = job;
  }
}

/**
 * Hủy một Job lập lịch
 */
export function cancelJob(scheduleId) {
  if (activeJobs[scheduleId]) {
    activeJobs[scheduleId].cancel();
    delete activeJobs[scheduleId];
    console.log(`[SCHEDULER] Đã hủy job hẹn giờ của Schedule ID: ${scheduleId}`);
    return true;
  }
  return false;
}

/**
 * Tiến hành thực hiện Upload video
 */
export async function triggerUpload(scheduleId) {
  const scheduleItem = await getScheduleById(scheduleId);
  if (!scheduleItem) {
    console.error(`[UPLOAD WORKER] Không tìm thấy lịch đăng video có ID: ${scheduleId}`);
    return;
  }

  if (scheduleItem.status === 'uploading') {
    console.log(`[UPLOAD WORKER] Schedule ID ${scheduleId} đang upload, bỏ qua yêu cầu trùng.`);
    return;
  }

  if (scheduleItem.status === 'success') {
    console.log(`[UPLOAD WORKER] Schedule ID ${scheduleId} đã đăng thành công trước đó, bỏ qua.`);
    return;
  }

  // Cập nhật trạng thái thành đang đăng
  scheduleItem.status = 'uploading';
  scheduleItem.log = 'Đang tiến hành upload video lên YouTube...';
  await saveSchedule(scheduleItem);

  try {
    const accounts = await getAccounts();
    const account = accounts.find(a => a.id === scheduleItem.accountId);
    if (!account) {
      throw new Error(`Không tìm thấy kênh/tài khoản liên kết với ID: ${scheduleItem.accountId}`);
    }

    const videoId = await uploadVideo(account, {
      title: scheduleItem.title,
      description: scheduleItem.description,
      videoPath: scheduleItem.videoPath,
      thumbnailPath: scheduleItem.thumbnailPath,
      privacyStatus: scheduleItem.privacyStatus,
      madeForKids: scheduleItem.madeForKids,
      playlistId: scheduleItem.playlistId
    });

    scheduleItem.status = 'success';
    scheduleItem.videoId = videoId;
    scheduleItem.log = `Đăng thành công! Link video: https://youtu.be/${videoId}`;
    scheduleItem.publishedTime = new Date().toISOString();
    await saveSchedule(scheduleItem);
    console.log(`[UPLOAD WORKER] Thành công! Đã đăng video ID: ${videoId} lên kênh ${account.name}`);
  } catch (error) {
    console.error(`[UPLOAD WORKER] Thất bại tại ID: ${scheduleId}. Chi tiết:`, error.message);
    scheduleItem.status = 'failed';
    scheduleItem.log = `Lỗi đăng: ${error.message}`;
    await saveSchedule(scheduleItem);
  }
}
