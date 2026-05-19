import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import * as stlService from '@services/stl.service.js';

/**
 * 로컬 PC 경로에서 STL 파일 직접 가져오기
 * body: { projectId, localPath }
 */
export const importSTLFromPath = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, localPath } = req.body;

    if (!projectId || !localPath) {
      res.status(400).json({ success: false, error: 'Missing projectId or localPath' });
      return;
    }

    if (!localPath.toLowerCase().endsWith('.stl')) {
      res.status(400).json({ success: false, error: 'Only .stl files are allowed' });
      return;
    }

    if (!fs.existsSync(localPath)) {
      res.status(404).json({ success: false, error: 'File not found: ' + localPath });
      return;
    }

    const fileName = path.basename(localPath);
    const destDir = path.join(process.cwd(), 'uploads', 'stl', projectId);
    fs.mkdirSync(destDir, { recursive: true });

    const destPath = path.join(destDir, fileName);
    fs.copyFileSync(localPath, destPath);

    const fileSize = fs.statSync(destPath).size;
    const fileUrl = `/uploads/stl/${projectId}/${fileName}`;

    const stlFile = await stlService.createSTLFile({
      projectId,
      originalUrl: fileUrl,
      fileName,
      fileSize,
    });

    res.status(201).json({ success: true, data: stlFile });
  } catch (error) {
    console.error('Error importing STL from path:', error);
    res.status(500).json({ success: false, error: 'Failed to import STL file' });
  }
};

/**
 * STL 파일 업로드 (로컬 디스크에 저장)
 */
export const uploadSTLFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.body;
    const file = req.file;

    if (!file || !projectId) {
      res.status(400).json({ success: false, error: 'Missing file or projectId' });
      return;
    }

    // Vite proxy(/uploads)를 통해 접근 가능한 URL
    const fileUrl = `/uploads/stl/${projectId}/${file.originalname}`;

    const stlFile = await stlService.createSTLFile({
      projectId,
      originalUrl: fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
    });

    res.status(201).json({ success: true, data: stlFile });
  } catch (error) {
    console.error('Error uploading STL file:', error);
    res.status(500).json({ success: false, error: 'Failed to upload STL file' });
  }
};

/**
 * 프로젝트의 STL 파일 목록 조회
 */
export const getSTLFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({ success: false, error: 'Missing projectId query parameter' });
      return;
    }

    const files = await stlService.getSTLFilesByProjectId(projectId);
    res.status(200).json({ success: true, data: files });
  } catch (error) {
    console.error('Error getting STL files:', error);
    res.status(500).json({ success: false, error: 'Failed to get STL files' });
  }
};

/**
 * STL 파일 가시성 토글
 */
export const updateVisibility = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stlId } = req.params;
    const { visibility } = req.body;

    if (typeof visibility !== 'boolean') {
      res.status(400).json({ success: false, error: 'visibility must be a boolean' });
      return;
    }

    await stlService.updateSTLVisibility(stlId, visibility);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update visibility' });
  }
};

/**
 * STL Transform 업데이트
 */
export const updateTransform = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stlId } = req.params;
    const { transform } = req.body;

    if (!transform) {
      res.status(400).json({ success: false, error: 'Missing transform data' });
      return;
    }

    await stlService.updateSTLTransform(stlId, transform);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update transform' });
  }
};

/**
 * STL 파일 삭제
 */
export const deleteSTLFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stlId } = req.params;
    await stlService.deleteSTLFile(stlId);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete STL file' });
  }
};

/**
 * 조정 로그 생성
 */
export const createLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stlId } = req.params;
    const { projectId, userId, adjustmentType, deltaValue, transform } = req.body;

    if (!projectId || !userId || !adjustmentType || !deltaValue || !transform) {
      res.status(400).json({ success: false, error: 'Missing required log fields' });
      return;
    }

    const log = await stlService.createAdjustmentLog({
      projectId,
      stlId,
      userId,
      adjustmentType,
      deltaValue,
      transform,
    });

    res.status(201).json({ success: true, data: log });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create adjustment log' });
  }
};

/**
 * STL 파일 복제 (Copy & Paste)
 * 원본 STL 파일을 디스크에서 복사하고, 동일한 변환 상태의 새 레코드를 생성한다.
 */
export const duplicateSTLFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stlId } = req.params;

    const source = await stlService.getSTLFileById(stlId);
    if (!source) {
      res.status(404).json({ success: false, error: 'Source STL file not found' });
      return;
    }

    // 원본 파일의 디스크 경로 (originalUrl 예: /uploads/stl/{projectId}/{fileName})
    const srcPath = path.join(process.cwd(), source.originalUrl);
    if (!fs.existsSync(srcPath)) {
      res.status(404).json({ success: false, error: 'Source file not found on disk' });
      return;
    }

    const destDir = path.dirname(srcPath);
    const ext = path.extname(source.fileName);
    const base = path.basename(source.fileName, ext);

    // 중복되지 않는 파일명 생성: "name (copy).stl", "name (copy 2).stl" ...
    let copyName = `${base} (copy)${ext}`;
    let counter = 2;
    while (fs.existsSync(path.join(destDir, copyName))) {
      copyName = `${base} (copy ${counter})${ext}`;
      counter += 1;
    }

    fs.copyFileSync(srcPath, path.join(destDir, copyName));

    const fileUrl = `/uploads/stl/${source.projectId}/${copyName}`;
    const duplicated = await stlService.createSTLFileWithTransform(
      {
        projectId: source.projectId,
        originalUrl: fileUrl,
        fileName: copyName,
        fileSize: source.fileSize,
      },
      source.currentTransform
    );

    res.status(201).json({ success: true, data: duplicated });
  } catch (error) {
    console.error('Error duplicating STL file:', error);
    res.status(500).json({ success: false, error: 'Failed to duplicate STL file' });
  }
};

/**
 * STL 파일의 조정 로그 조회
 */
export const getLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stlId } = req.params;
    const logs = await stlService.getAdjustmentLogsBySTLId(stlId);
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get logs' });
  }
};

/**
 * 조정 로그 단건 삭제
 */
export const deleteLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { logId } = req.params;
    await stlService.deleteAdjustmentLog(logId);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete log' });
  }
};

/**
 * STL의 모든 조정 로그 삭제
 */
export const deleteAllLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stlId } = req.params;
    await stlService.deleteAllAdjustmentLogs(stlId);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete logs' });
  }
};
