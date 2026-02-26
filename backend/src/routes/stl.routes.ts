import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as stlController from '@controllers/stl.controller.js';

const router = Router();

/**
 * Multer 설정 - 로컬 디스크에 projectId별 폴더로 저장
 */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = req.body.projectId || 'unknown';
    const uploadDir = path.join(process.cwd(), 'uploads', 'stl', projectId);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname); // 원본 파일명 유지
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.stl')) {
      cb(null, true);
    } else {
      cb(new Error('Only .stl files are allowed'));
    }
  },
});

// STL 파일 업로드 (브라우저 파일 input)
router.post('/upload', upload.single('file'), stlController.uploadSTLFile);

// 로컬 PC 경로에서 STL 파일 직접 가져오기
router.post('/import-path', stlController.importSTLFromPath);

// 프로젝트의 STL 파일 목록 조회
router.get('/', stlController.getSTLFiles);

// 조정 로그 단건 삭제 (/:stlId 보다 먼저 정의해야 라우팅 충돌 방지)
router.delete('/logs/:logId', stlController.deleteLog);

// STL 파일 가시성 토글
router.put('/:stlId/visibility', stlController.updateVisibility);

// STL Transform 업데이트
router.put('/:stlId/transform', stlController.updateTransform);

// STL 파일 삭제
router.delete('/:stlId', stlController.deleteSTLFile);

// STL 조정 로그 조회
router.get('/:stlId/logs', stlController.getLogs);

// 조정 로그 생성
router.post('/:stlId/logs', stlController.createLog);

// STL의 모든 조정 로그 삭제
router.delete('/:stlId/logs', stlController.deleteAllLogs);

export default router;
