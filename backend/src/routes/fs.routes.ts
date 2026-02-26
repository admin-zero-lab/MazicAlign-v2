import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * 드라이브 목록 반환 (Windows)
 */
const getWindowsDrives = (): string[] => {
  const drives: string[] = [];
  // A-Z 드라이브 확인
  for (let i = 65; i <= 90; i++) {
    const drive = `${String.fromCharCode(i)}:\\`;
    try {
      fs.accessSync(drive);
      drives.push(drive);
    } catch {
      // 드라이브 없음
    }
  }
  return drives;
};

/**
 * GET /api/fs?path=...
 * 로컬 PC 폴더 탐색
 */
router.get('/', (req: Request, res: Response) => {
  let requestedPath = (req.query.path as string) || '';

  // 최상위: 드라이브 목록 반환
  if (!requestedPath || requestedPath === '/') {
    if (process.platform === 'win32') {
      const drives = getWindowsDrives();
      return res.json({
        success: true,
        currentPath: '/',
        parentPath: null,
        items: drives.map((d) => ({
          name: d,
          fullPath: d,
          isDirectory: true,
          size: null,
        })),
      });
    } else {
      requestedPath = '/';
    }
  }

  try {
    const stat = fs.statSync(requestedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: 'Not a directory' });
    }

    const entries = fs.readdirSync(requestedPath, { withFileTypes: true });
    const items = entries
      .filter((e) => {
        // 숨김 파일 제외, STL 파일이거나 디렉토리만
        if (e.name.startsWith('.')) return false;
        if (e.isDirectory()) return true;
        return e.name.toLowerCase().endsWith('.stl');
      })
      .map((e) => {
        const fullPath = path.join(requestedPath, e.name);
        let size: number | null = null;
        if (!e.isDirectory()) {
          try {
            size = fs.statSync(fullPath).size;
          } catch {}
        }
        return {
          name: e.name,
          fullPath,
          isDirectory: e.isDirectory(),
          size,
        };
      })
      .sort((a, b) => {
        // 폴더 먼저, 그 다음 파일 알파벳순
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    // 상위 경로 계산
    const parentPath = path.dirname(requestedPath);
    const isRoot =
      requestedPath === parentPath ||
      (process.platform === 'win32' && /^[A-Z]:\\?$/i.test(requestedPath));

    res.json({
      success: true,
      currentPath: requestedPath,
      parentPath: isRoot ? '/' : parentPath,
      items,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: `Cannot read directory: ${(error as Error).message}`,
    });
  }
});

export default router;
