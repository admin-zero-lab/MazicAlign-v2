import { useState, useEffect } from 'react';
import {
  uploadSTLFile,
  getSTLFilesByProjectId,
  toggleSTLVisibility,
  deleteSTLFile,
  createAdjustmentLog,
  updateSTLTransform,
  duplicateSTLFile,
} from '@services/stl.service';
import type { STLFile, AdjustmentType, DeltaValue } from '@apptypes/stl.types';

/**
 * STL 파일 관리 커스텀 훅
 */
export const useSTLFiles = (projectId?: string) => {
  const [stlFiles, setSTLFiles] = useState<STLFile[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * STL 파일 목록 조회
   */
  const fetchSTLFiles = async (projId: string) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch project files from backend
      const backendFiles = await getSTLFilesByProjectId(projId);

      console.log('[useSTLFiles] Loaded files from backend:', backendFiles.length);

      setSTLFiles(backendFiles);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch STL files';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /**
   * STL 파일 업로드
   */
  const uploadFile = async (
    projId: string,
    file: File,
    userId: string
  ): Promise<STLFile | null> => {
    setLoading(true);
    setError(null);
    try {
      const newFile = await uploadSTLFile(projId, file, userId);
      setSTLFiles((prev) => [...prev, newFile]);
      return newFile;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload STL file';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * STL 파일 가시성 토글
   */
  const toggleVisibility = async (stlId: string, visibility: boolean): Promise<boolean> => {
    try {
      // Local files don't need backend update
      if (!stlId.startsWith('local-')) {
        await toggleSTLVisibility(stlId, visibility);
      }

      setSTLFiles((prev) =>
        prev.map((file) => (file.stlId === stlId ? { ...file, visibility } : file))
      );
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle visibility';
      setError(errorMessage);
      return false;
    }
  };

  /**
   * STL 파일 삭제
   */
  const deleteFile = async (stlId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      // Local files don't need backend update
      if (!stlId.startsWith('local-')) {
        await deleteSTLFile(stlId);
      }

      setSTLFiles((prev) => prev.filter((file) => file.stlId !== stlId));
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete STL file';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * STL 조정 및 로그 생성
   */
  const adjustSTL = async (
    projId: string,
    stlId: string,
    userId: string,
    adjustmentType: AdjustmentType,
    deltaValue: DeltaValue,
    newTransform: STLFile['currentTransform']
  ): Promise<boolean> => {
    try {
      // 조정 로그 생성 (Skip for local files)
      if (!stlId.startsWith('local-')) {
        // 로그에 조정 후 전체 변환 스냅샷을 함께 저장 (Undo/Redo 복원용)
        await createAdjustmentLog(projId, stlId, userId, adjustmentType, deltaValue, newTransform);
        // Transform 업데이트
        await updateSTLTransform(stlId, newTransform);
      }

      // 로컬 상태 업데이트
      setSTLFiles((prev) =>
        prev.map((file) =>
          file.stlId === stlId ? { ...file, currentTransform: newTransform, previewTransform: undefined } : file
        )
      );

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to adjust STL';
      setError(errorMessage);
      return false;
    }
  };

  /**
   * STL 미리보기 (로그 없이 로컬 상태만 업데이트)
   */
  const previewSTL = (stlId: string, transform: STLFile['currentTransform']) => {
    setSTLFiles((prev) =>
      prev.map((file) =>
        file.stlId === stlId ? { ...file, previewTransform: transform } : file
      )
    );
  };

  /**
   * STL Transform 직접 설정 (로그 생성 없이 currentTransform 갱신)
   * Undo/Redo로 특정 히스토리 시점의 변환 상태를 복원할 때 사용한다.
   */
  const setTransform = async (
    stlId: string,
    transform: STLFile['currentTransform']
  ): Promise<boolean> => {
    try {
      if (!stlId.startsWith('local-')) {
        await updateSTLTransform(stlId, transform);
      }
      setSTLFiles((prev) =>
        prev.map((file) =>
          file.stlId === stlId
            ? { ...file, currentTransform: transform, previewTransform: undefined }
            : file
        )
      );
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set transform';
      setError(errorMessage);
      return false;
    }
  };

  /**
   * STL 파일 복제 (Copy & Paste — 모델 자체를 통째로 복제)
   */
  const duplicateFile = async (stlId: string): Promise<STLFile | null> => {
    if (stlId.startsWith('local-')) {
      setError('로컬 파일은 복제할 수 없습니다.');
      return null;
    }
    try {
      const newFile = await duplicateSTLFile(stlId);
      setSTLFiles((prev) => [...prev, newFile]);
      return newFile;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to duplicate STL file';
      setError(errorMessage);
      return null;
    }
  };

  // projectId가 제공되면 자동으로 STL 파일 목록 조회
  useEffect(() => {
    if (projectId) {
      fetchSTLFiles(projectId);
    }
  }, [projectId]);

  return {
    stlFiles,
    loading,
    error,
    fetchSTLFiles,
    uploadFile,
    toggleVisibility,
    deleteFile,
    adjustSTL,
    previewSTL,
    setTransform,
    duplicateFile,
  };
};
