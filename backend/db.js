import fs from 'fs';
import { DATA_DIR, DB_FILE, ensureStorageDirs } from './storage_paths.js';

// Đảm bảo thư mục dữ liệu tồn tại
ensureStorageDirs();

// Khởi tạo file database nếu chưa tồn tại
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ accounts: [], schedules: [] }, null, 2), 'utf-8');
}

// Khóa đồng bộ đơn giản để tránh xung đột ghi đè
let writeQueue = Promise.resolve();

export async function readDb() {
  try {
    const data = await fs.promises.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Lỗi đọc database:', error);
    return { accounts: [], schedules: [] };
  }
}

export function getStorageInfo() {
  return {
    dataDir: DATA_DIR,
    dbFile: DB_FILE
  };
}

export async function writeDb(data) {
  writeQueue = writeQueue.then(async () => {
    try {
      await fs.promises.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Lỗi ghi database:', error);
    }
  });
  return writeQueue;
}

// APIs cho Accounts
export async function getAccounts() {
  const db = await readDb();
  return db.accounts || [];
}

export async function saveAccount(account) {
  const db = await readDb();
  const index = db.accounts.findIndex(a => a.id === account.id);
  if (index >= 0) {
    db.accounts[index] = { ...db.accounts[index], ...account };
  } else {
    db.accounts.push(account);
  }
  await writeDb(db);
  return account;
}

export async function deleteAccount(accountId) {
  const db = await readDb();
  db.accounts = db.accounts.filter(a => a.id !== accountId);
  db.schedules = db.schedules.filter(s => s.accountId !== accountId); // Xóa luôn lịch của kênh này
  await writeDb(db);
}

// APIs cho Schedules
export async function getSchedules() {
  const db = await readDb();
  return db.schedules || [];
}

export async function getScheduleById(id) {
  const db = await readDb();
  return db.schedules.find(s => s.id === id);
}

export async function saveSchedule(schedule) {
  const db = await readDb();
  const index = db.schedules.findIndex(s => s.id === schedule.id);
  if (index >= 0) {
    db.schedules[index] = { ...db.schedules[index], ...schedule };
  } else {
    db.schedules.push(schedule);
  }
  await writeDb(db);
  return schedule;
}

export async function deleteSchedule(id) {
  const db = await readDb();
  const schedule = db.schedules.find(s => s.id === id);
  db.schedules = db.schedules.filter(s => s.id !== id);
  await writeDb(db);
  return schedule;
}
