import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

/**
 * SQLite DB 싱글턴 반환
 */
export const getDb = (): Database.Database => {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
};

/**
 * SQLite 초기화 및 테이블 생성
 */
export const initDatabase = (): void => {
  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, 'mazicalign.db');
  db = new Database(dbPath);

  // WAL 모드: 읽기/쓰기 성능 향상
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      userId      TEXT PRIMARY KEY,
      email       TEXT,
      displayName TEXT,
      role        TEXT DEFAULT 'master',
      createdAt   TEXT,
      lastLogin   TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      projectId   TEXT PRIMARY KEY,
      ownerId     TEXT NOT NULL,
      projectCode TEXT UNIQUE NOT NULL,
      projectName TEXT NOT NULL,
      patientInfo TEXT DEFAULT '{}',
      createdAt   TEXT NOT NULL,
      lastModified TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_ownerId ON projects(ownerId);

    CREATE TABLE IF NOT EXISTS stl_files (
      stlId            TEXT PRIMARY KEY,
      projectId        TEXT NOT NULL,
      originalUrl      TEXT NOT NULL,
      fileName         TEXT NOT NULL,
      fileSize         INTEGER DEFAULT 0,
      visibility       INTEGER DEFAULT 1,
      currentTransform TEXT NOT NULL,
      uploadedAt       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_stl_files_projectId ON stl_files(projectId);

    CREATE TABLE IF NOT EXISTS adjustment_logs (
      logId          TEXT PRIMARY KEY,
      projectId      TEXT NOT NULL,
      stlId          TEXT NOT NULL,
      userId         TEXT NOT NULL,
      adjustmentType TEXT NOT NULL,
      deltaValue     TEXT NOT NULL,
      timestamp      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_stlId ON adjustment_logs(stlId);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON adjustment_logs(timestamp);
  `);

  console.log(`✅ SQLite database initialized: ${dbPath}`);
};
