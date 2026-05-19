import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mesh, VertexBuffer } from '@babylonjs/core';
import { useAuth } from '@hooks/useAuth';
import { useProject } from '@hooks/useProjects';
import { useSTLFiles } from '@hooks/useSTLFiles';
import STLViewer, { STLViewerHandle } from '@components/STLViewer';
import STLFileList from '@components/STLFileList';
import ViewerControls from '@components/ViewerControls';
import EditToolbar from '@components/EditToolbar';
import TransformPanel from '@components/TransformPanel';
import HistoryViewer from '@components/HistoryViewer';
import SupportPanel from '@components/SupportPanel';
import SettingsModal from '@components/SettingsModal';
import SlicerPanel from '@components/Slicer/SlicerPanel';
import SlicePreview from '@components/Slicer/SlicePreview';
import LocalFileBrowser from '@components/LocalFileBrowser';
import { slicerService } from '@services/slicer/SlicerService';
import { importSTLFromPath, getAdjustmentLogsBySTLId } from '@services/stl.service';
import { SliceSettings, LayerData } from '@services/slicer/types';
import { AdjustmentType, Transform, DeltaValue } from '../types/stl.types';
import {
  SupportPoint,
  SupportSettings,
  SupportMode,
  DEFAULT_SUPPORT_SETTINGS,
} from '../types/support.types';
import { getTransformFromMesh } from '@utils/stl-loader.utils';

/** 서포트 설정 localStorage 키 */
const SUPPORT_STORAGE_KEY = 'mazicalign_support_settings';

/** 화살표 키 '탭'(짧게 누름) 1회 이동량 (mm) — 기본 / Shift 병행 시 미세 이동 */
const NUDGE_STEP = 1;
const NUDGE_FINE_STEP = 0.1;
/** 화살표 키를 길게 누를 때의 연속 이동 속도 (mm/초) — 기본 / Shift 병행 시 */
const NUDGE_SPEED = 40;
const NUDGE_FINE_SPEED = 6;
/** '탭' 1회 이동에서 연속(부드러운) 이동으로 전환되기까지의 대기 시간 (ms) */
const NUDGE_HOLD_DELAY = 250;

/** 조정 이력이 없을 때의 기본 변환 상태 (Undo 체인의 시작점) */
const DEFAULT_TRANSFORM: Transform = {
  translation: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};

/** 두 변환이 (오차 범위 내에서) 동일한지 비교 */
const transformsEqual = (a: Transform, b: Transform): boolean => {
  const EPS = 1e-6;
  return (
    Math.abs(a.translation.x - b.translation.x) < EPS &&
    Math.abs(a.translation.y - b.translation.y) < EPS &&
    Math.abs(a.translation.z - b.translation.z) < EPS &&
    Math.abs(a.rotation.x - b.rotation.x) < EPS &&
    Math.abs(a.rotation.y - b.rotation.y) < EPS &&
    Math.abs(a.rotation.z - b.rotation.z) < EPS &&
    Math.abs(a.rotation.w - b.rotation.w) < EPS &&
    Math.abs(a.scale.x - b.scale.x) < EPS &&
    Math.abs(a.scale.y - b.scale.y) < EPS &&
    Math.abs(a.scale.z - b.scale.z) < EPS
  );
};

/**
 * 3D 뷰어 페이지
 * 프로젝트의 STL 파일 업로드 및 3D 뷰어 표시
 */
const ViewerPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { project, loading: projectLoading } = useProject(projectId);
  const {
    stlFiles,
    loading: filesLoading,
    fetchSTLFiles,
    toggleVisibility,
    deleteFile,
    adjustSTL,
    previewSTL,
    setTransform,
    duplicateFile,
  } = useSTLFiles(projectId);

  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'transform' | 'history' | 'support'>('transform');

  // 복사된 모델의 stlId (Ctrl+C로 복사, Ctrl+V로 복제)
  const [clipboardStlId, setClipboardStlId] = useState<string | null>(null);

  // 서포트(지지대) 상태
  const [supports, setSupports] = useState<SupportPoint[]>([]);
  const [supportSettings, setSupportSettings] = useState<SupportSettings>(() => {
    try {
      const saved = localStorage.getItem(SUPPORT_STORAGE_KEY);
      if (saved) return { ...DEFAULT_SUPPORT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      /* 손상된 저장값 무시 */
    }
    return DEFAULT_SUPPORT_SETTINGS;
  });
  const [supportMode, setSupportMode] = useState<SupportMode>('off');
  const [supportsVisible, setSupportsVisible] = useState(true);

  // 서포트 설정 변경 시 localStorage에 저장
  useEffect(() => {
    localStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(supportSettings));
  }, [supportSettings]);

  // Settings state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [transparency, setTransparency] = useState(80); // 0-100% (Default 80%)

  // Slicer state
  const [isSlicerOpen, setIsSlicerOpen] = useState(false);
  const [isSlicing, setIsSlicing] = useState(false);
  const [sliceProgress, setSliceProgress] = useState(0);
  const [sliceStatus, setSliceStatus] = useState('');
  const [slicedLayers, setSlicedLayers] = useState<LayerData[]>([]);
  const [lastSliceSettings, setLastSliceSettings] = useState<SliceSettings | null>(null);
  const [slicerViewMode, setSlicerViewMode] = useState<'3d' | '2d'>('3d');

  // Refs
  const pendingScaleUpdates = useRef<{ x?: number; y?: number; z?: number }>({});
  const scaleUpdateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meshMapRef = useRef<Map<string, Mesh>>(new Map());
  const stlViewerRef = useRef<STLViewerHandle>(null);
  // 화살표 키 이동: keydown 동안 누적할 목표 변환 (stlId → Transform)
  const pendingNudgeRef = useRef<Map<string, Transform>>(new Map());
  // 화살표 키 연속 이동(requestAnimationFrame 루프) 상태
  const heldArrowsRef = useRef<Set<string>>(new Set()); // 현재 눌려 있는 화살표 키
  const shiftHeldRef = useRef(false);                   // Shift 동시 입력 여부(미세 이동)
  const nudgeRafRef = useRef<number | null>(null);      // 진행 중인 rAF 핸들
  const nudgeStartRef = useRef(0);                      // 연속 이동 루프 시작 타임스탬프
  const nudgeLastTsRef = useRef(0);                     // 직전 프레임 타임스탬프(Δt 계산용)

  // 선택된 파일 객체들
  const selectedFiles = stlFiles.filter((f) => selectedFileIds.has(f.stlId));
  // 대표 파일 (Transform 패널 표시용 - 첫 번째 선택된 파일)
  const primarySelectedFile = selectedFiles.length > 0 ? selectedFiles[0] : null;

  /**
   * Mesh Load Handler
   */
  const handleMeshLoaded = useCallback((id: string, mesh: Mesh) => {
    meshMapRef.current.set(id, mesh);
  }, []);

  /**
   * 파일 선택 핸들러
   */
  const handleFileSelect = (stlId: string, multiSelect: boolean) => {
    setSelectedFileIds((prev) => {
      if (multiSelect) {
        // Multi-select mode: Toggle selection
        const newSet = new Set(prev);
        if (newSet.has(stlId)) {
          newSet.delete(stlId);
        } else {
          newSet.add(stlId);
        }
        return newSet;
      } else {
        // Single-select mode
        // If clicking the currently selected single file, deselect it (Toggle off)
        if (prev.has(stlId) && prev.size === 1) {
          return new Set();
        }
        // Otherwise, select only this file
        return new Set([stlId]);
      }
    });
  };

  /**
   * 선택 해제 핸들러
   */
  const handleClearSelection = () => {
    setSelectedFileIds(new Set());
  };

  /**
   * 전체 선택 (Ctrl+A) — 불러온 모든 STL 파일을 선택한다.
   */
  const handleSelectAll = () => {
    setSelectedFileIds(new Set(stlFiles.map((f) => f.stlId)));
  };

  /**
   * LocalFileBrowser에서 파일 선택 완료 핸들러
   */
  const handleFilesSelected = async (localPaths: string[]) => {
    setShowFileBrowser(false);
    if (!projectId) return;

    setUploading(true);
    try {
      for (const localPath of localPaths) {
        const fileName = localPath.split(/[\\/]/).pop() ?? localPath;

        // 중복 체크
        const isDuplicate = stlFiles.some(f => f.fileName === fileName);
        if (isDuplicate) {
          continue;
        }

        try {
          await importSTLFromPath(projectId, localPath);
        } catch (err) {
          console.error(`[ViewerPage] Failed to import ${fileName}:`, err);
          alert(`Failed to import ${fileName}. Please try again.`);
        }
      }
      // 목록 새로고침
      await fetchSTLFiles(projectId);
    } finally {
      setUploading(false);
    }
  };

  /**
   * Transform 변경 핸들러 (Batch Transform)
   */
  const handleTransformChange = async (
    type: AdjustmentType,
    axis: 'x' | 'y' | 'z',
    value: number
  ) => {
    if (selectedFiles.length === 0 || !user || !projectId) return;

    // For scale updates, batch them together to prevent multiple history entries
    if (type === AdjustmentType.SCALE) {
      pendingScaleUpdates.current[axis] = value;

      // Clear existing timeout
      if (scaleUpdateTimeout.current) {
        clearTimeout(scaleUpdateTimeout.current);
      }

      // Wait a bit to see if more scale updates come in (for uniform scale)
      scaleUpdateTimeout.current = setTimeout(async () => {
        const updates = { ...pendingScaleUpdates.current };
        pendingScaleUpdates.current = {};

        // Process all pending scale updates as a batch
        for (const file of selectedFiles) {
          const oldTransform = file.currentTransform;
          // 중첩 객체까지 깊은 복사 — 얕은 복사 시 scale 참조가 oldTransform과
          // 공유되어, 아래 delta 계산이 항상 0이 되고(이미 갱신된 값과 비교)
          // 스케일 조정이 DB에 저장되지 않는 버그가 있었다.
          const newTransform: Transform = {
            translation: { ...oldTransform.translation },
            rotation: { ...oldTransform.rotation },
            scale: { ...oldTransform.scale },
          };

          // Apply all pending scale updates
          if (updates.x !== undefined) newTransform.scale.x = updates.x;
          if (updates.y !== undefined) newTransform.scale.y = updates.y;
          if (updates.z !== undefined) newTransform.scale.z = updates.z;

          // Calculate delta for the first axis that changed (for history purposes)
          const firstAxis = Object.keys(updates)[0] as 'x' | 'y' | 'z';
          const deltaValue = { [firstAxis]: updates[firstAxis]! - oldTransform.scale[firstAxis] };

          // Skip if no significant change
          if (Math.abs(deltaValue[firstAxis]) < 0.0001) continue;

          await adjustSTL(
            projectId,
            file.stlId,
            user.userId,
            AdjustmentType.SCALE,
            deltaValue,
            newTransform
          );
        }
      }, 10); // 10ms debounce to batch uniform scale updates

      return;
    }

    // For non-scale updates, process immediately
    for (const file of selectedFiles) {
      const oldTransform = file.currentTransform;
      const newTransform = { ...oldTransform };
      let deltaValue: DeltaValue = {};

      if (type === AdjustmentType.TRANSLATION) {
        newTransform.translation = {
          ...newTransform.translation,
          [axis]: value,
        };
        deltaValue = { [axis]: value - oldTransform.translation[axis] };
      } else if (type === AdjustmentType.ROTATION) {
        // Convert Euler angle to Quaternion
        const radians = (value * Math.PI) / 180;
        const halfAngle = radians / 2;
        const s = Math.sin(halfAngle);
        const c = Math.cos(halfAngle);

        if (axis === 'x') {
          newTransform.rotation = { x: s, y: 0, z: 0, w: c };
        } else if (axis === 'y') {
          newTransform.rotation = { x: 0, y: s, z: 0, w: c };
        } else {
          newTransform.rotation = { x: 0, y: 0, z: s, w: c };
        }

        deltaValue = { [axis]: value };
      }

      await adjustSTL(
        projectId,
        file.stlId,
        user.userId,
        type,
        deltaValue,
        newTransform
      );
    }
  };

  /**
   * Transform 미리보기 핸들러 (No DB Log)
   */
  const handleTransformPreview = (
    type: AdjustmentType,
    axis: 'x' | 'y' | 'z',
    value: number
  ) => {
    if (selectedFiles.length === 0) return;

    // Apply preview to ALL selected files (local state only, no DB)
    for (const file of selectedFiles) {
      const oldTransform = file.currentTransform;
      let newTransform = { ...oldTransform };

      if (type === AdjustmentType.TRANSLATION) {
        newTransform.translation = {
          ...newTransform.translation,
          [axis]: value,
        };
      } else if (type === AdjustmentType.ROTATION) {
        // Convert Euler angle to Quaternion
        const radians = (value * Math.PI) / 180;
        const halfAngle = radians / 2;
        const s = Math.sin(halfAngle);
        const c = Math.cos(halfAngle);

        if (axis === 'x') {
          newTransform.rotation = { x: s, y: 0, z: 0, w: c };
        } else if (axis === 'y') {
          newTransform.rotation = { x: 0, y: s, z: 0, w: c };
        } else {
          newTransform.rotation = { x: 0, y: 0, z: s, w: c };
        }
      } else if (type === AdjustmentType.SCALE) {
        newTransform.scale = {
          ...newTransform.scale,
          [axis]: value,
        };
      }

      // Update preview transform (no DB call)
      previewSTL(file.stlId, newTransform);
    }
  };

  /**
   * 화살표 키 이동 — 선택 모델의 X(좌우)·Z(상하) 평행 이동 (keydown)
   *
   * Gizmo에서는 Z축(상하) 이동이 비활성화돼 있어, 선택한 모델의 수직 이동은
   * 화살표 키로 처리한다. X축(좌우) 이동도 화살표 키로 함께 지원한다.
   * Z축은 빌드스테이지 바닥(translation.z = 0) 아래로 내려가지 않도록
   * 클램프한다(바닥 침투방지). X축은 드래그 이동과 동일하게 제한이 없다.
   *
   * keydown 동안에는 미리보기만 갱신하고 목표 변환을 ref에 누적한다.
   * 실제 커밋은 keyup 시 한 번만 수행해 키 반복(auto-repeat)으로 조정
   * 이력이 과도하게 쌓이는 것을 막는다.
   *
   * @returns 선택된 모델이 있어 키 입력을 소비했으면 true
   */
  const handleNudge = (axis: 'x' | 'z', delta: number): boolean => {
    if (selectedFiles.length === 0) return false;

    for (const file of selectedFiles) {
      const base =
        pendingNudgeRef.current.get(file.stlId) ??
        file.previewTransform ??
        file.currentTransform;
      // Z축(상하)만 바닥 아래로 내려가지 않도록 0 이상으로 클램프
      const raw = base.translation[axis] + delta;
      const nextVal = axis === 'z' ? Math.max(0, raw) : raw;
      if (nextVal === base.translation[axis]) continue; // 바닥에 닿아 더 못 움직임

      const next: Transform = {
        ...base,
        translation: { ...base.translation, [axis]: nextVal },
      };
      pendingNudgeRef.current.set(file.stlId, next);
      previewSTL(file.stlId, next);
    }
    return true;
  };

  /**
   * 화살표 키 이동 커밋 — 화살표 키에서 손을 뗀 시점(keyup)에 호출.
   * keydown 동안 누적된 목표 변환을 모델별로 한 번씩 조정 이력에 기록한다.
   */
  const handleNudgeCommit = async () => {
    const pending = pendingNudgeRef.current;
    pendingNudgeRef.current = new Map();
    if (!user || !projectId || pending.size === 0) return;

    for (const file of selectedFiles) {
      const target = pending.get(file.stlId);
      if (!target) continue;

      const cur = file.currentTransform.translation;
      const delta: DeltaValue = {};
      if (Math.abs(target.translation.x - cur.x) > 0.0001) delta.x = target.translation.x - cur.x;
      if (Math.abs(target.translation.y - cur.y) > 0.0001) delta.y = target.translation.y - cur.y;
      if (Math.abs(target.translation.z - cur.z) > 0.0001) delta.z = target.translation.z - cur.z;
      if (Object.keys(delta).length === 0) continue;

      await adjustSTL(
        projectId,
        file.stlId,
        user.userId,
        AdjustmentType.TRANSLATION,
        delta,
        target
      );
    }
  };

  /**
   * Gizmo Transform 변경 핸들러 (Drag 완료 시)
   */
  const handleGizmoTransformChange = async (stlId: string, mesh: Mesh) => {
    if (!user || !projectId) return;

    // Mesh에서 현재 transform 추출 (Babylon → 사용자 좌표계 변환 포함)
    const newTransform = getTransformFromMesh(mesh);

    // 기존 transform 가져오기
    const file = stlFiles.find(f => f.stlId === stlId);
    if (!file) {
      console.error('[ViewerPage] File not found in stlFiles:', stlId);
      return;
    }

    const oldTransform = file.currentTransform;

    // Translation 변경사항 계산 및 저장
    const translationChanged =
      Math.abs(newTransform.translation.x - oldTransform.translation.x) > 0.0001 ||
      Math.abs(newTransform.translation.y - oldTransform.translation.y) > 0.0001 ||
      Math.abs(newTransform.translation.z - oldTransform.translation.z) > 0.0001;

    if (translationChanged) {
      // 가장 큰 변화가 있는 축을 찾아 delta 계산
      const deltaX = newTransform.translation.x - oldTransform.translation.x;
      const deltaY = newTransform.translation.y - oldTransform.translation.y;
      const deltaZ = newTransform.translation.z - oldTransform.translation.z;

      const maxDelta = Math.max(Math.abs(deltaX), Math.abs(deltaY), Math.abs(deltaZ));
      let axis: 'x' | 'y' | 'z' = 'x';
      let deltaValue = deltaX;

      if (Math.abs(deltaY) === maxDelta) {
        axis = 'y';
        deltaValue = deltaY;
      } else if (Math.abs(deltaZ) === maxDelta) {
        axis = 'z';
        deltaValue = deltaZ;
      }

      await adjustSTL(
        projectId,
        stlId,
        user.userId,
        AdjustmentType.TRANSLATION,
        { [axis]: deltaValue },
        newTransform
      );
    }

    // Rotation 변경사항 확인 및 저장
    const rotationChanged =
      Math.abs(newTransform.rotation.x - oldTransform.rotation.x) > 0.0001 ||
      Math.abs(newTransform.rotation.y - oldTransform.rotation.y) > 0.0001 ||
      Math.abs(newTransform.rotation.z - oldTransform.rotation.z) > 0.0001 ||
      Math.abs(newTransform.rotation.w - oldTransform.rotation.w) > 0.0001;

    if (rotationChanged) {
      // Rotation은 quaternion 전체를 저장
      await adjustSTL(
        projectId,
        stlId,
        user.userId,
        AdjustmentType.ROTATION,
        { x: 0, y: 0, z: 0 }, // Delta는 의미 없음 (quaternion)
        newTransform
      );
    }
  };


  /**
   * Transform 리셋 핸들러
   */
  const handleTransformReset = async () => {
    if (selectedFiles.length === 0 || !user || !projectId) return;

    const defaultTransform = {
      translation: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    // 각 축에 대해 리셋
    for (const file of selectedFiles) {
      await adjustSTL(
        projectId,
        file.stlId,
        user.userId,
        AdjustmentType.TRANSLATION,
        { x: -file.currentTransform.translation.x, y: -file.currentTransform.translation.y, z: -file.currentTransform.translation.z },
        defaultTransform
      );
    }
  };

  /**
   * 뷰어 컨트롤 핸들러들
   */
  const handleResetView = () => {
    stlViewerRef.current?.resetView();
  };

  // HOME: 뷰어(카메라)를 기본 위치로 초기화
  const handleHome = () => {
    stlViewerRef.current?.homeView();
  };

  /**
   * 자동 서포트 생성
   * 선택된 모델(없으면 전체)의 오버행을 분석해 서포트를 생성한다.
   * @param platformOnly true면 모든 서포트를 빌드플레이트까지 곧장 내린다.
   */
  const handleGenerateSupports = (platformOnly: boolean) => {
    const targets = selectedFiles.length > 0 ? selectedFiles : stlFiles;
    if (targets.length === 0) return;

    const generated: SupportPoint[] = [];
    for (const file of targets) {
      const points =
        stlViewerRef.current?.generateSupports(file.stlId, supportSettings, platformOnly) ?? [];
      generated.push(...points);
    }

    // 대상 모델의 기존 서포트는 새로 생성한 것으로 교체
    const targetIds = new Set(targets.map((f) => f.stlId));
    setSupports((prev) => [...prev.filter((s) => !targetIds.has(s.stlId)), ...generated]);
  };

  /** 모든 서포트 삭제 */
  const handleClearSupports = () => setSupports([]);

  /** 서포트 설정을 기본값으로 초기화 */
  const handleResetSupportSettings = () => setSupportSettings(DEFAULT_SUPPORT_SETTINGS);

  /**
   * 복사 (Ctrl+C) — 선택된 모델을 클립보드에 담는다.
   */
  const handleCopy = () => {
    if (!primarySelectedFile) return;
    setClipboardStlId(primarySelectedFile.stlId);
  };

  /**
   * 붙여넣기 (Ctrl+V) — 복사된 모델을 통째로 복제한다.
   */
  const handlePaste = async () => {
    if (!clipboardStlId) return;
    const newFile = await duplicateFile(clipboardStlId);
    if (newFile) {
      // 새로 붙여넣은 모델을 선택 상태로 전환
      setSelectedFileIds(new Set([newFile.stlId]));
    }
  };

  /**
   * 선택된 파일의 조정 이력을 단계별 변환 상태 배열로 변환한다.
   * 반환: [기본 변환, ...오래된 순 로그 변환]
   */
  const fetchHistoryStates = async (stlId: string): Promise<Transform[]> => {
    const logs = await getAdjustmentLogsBySTLId(stlId); // 최신순
    return [DEFAULT_TRANSFORM, ...[...logs].reverse().map((log) => log.transform)];
  };

  /**
   * 실행취소 (Ctrl+Z) — 선택된 모델을 바로 이전 단계로 되돌린다.
   */
  const handleUndo = async () => {
    if (!primarySelectedFile) return;
    const states = await fetchHistoryStates(primarySelectedFile.stlId);
    const current = primarySelectedFile.currentTransform;
    let idx = states.findIndex((s) => transformsEqual(s, current));
    // 현재 상태가 이력에 없으면 가장 최신 단계의 다음으로 간주
    if (idx === -1) idx = states.length;
    if (idx > 0) {
      await setTransform(primarySelectedFile.stlId, states[idx - 1]);
    }
  };

  /**
   * 다시실행 (Ctrl+Y) — 선택된 모델을 바로 다음 단계로 진행한다.
   */
  const handleRedo = async () => {
    if (!primarySelectedFile) return;
    const states = await fetchHistoryStates(primarySelectedFile.stlId);
    const current = primarySelectedFile.currentTransform;
    const idx = states.findIndex((s) => transformsEqual(s, current));
    if (idx !== -1 && idx < states.length - 1) {
      await setTransform(primarySelectedFile.stlId, states[idx + 1]);
    }
  };

  // 키보드 단축키 핸들러를 ref에 보관 (리스너 재등록 없이 최신 상태 참조)
  const editActionsRef = useRef({
    handleCopy,
    handlePaste,
    handleUndo,
    handleRedo,
    handleSelectAll,
    handleNudge,
    handleNudgeCommit,
    hasSelection: selectedFiles.length > 0,
  });
  editActionsRef.current = {
    handleCopy,
    handlePaste,
    handleUndo,
    handleRedo,
    handleSelectAll,
    handleNudge,
    handleNudgeCommit,
    hasSelection: selectedFiles.length > 0,
  };

  // 단축키:
  //  - ↑/↓        : 선택 모델 Z축(상하) 이동 — 탭 1회 = 1mm, 길게 누르면 연속 이동
  //  - ←/→        : 선택 모델 좌우 이동 — →는 화면 우측, ←는 화면 좌측
  //                 (사용자 X+ 는 화면 좌측이므로 →가 X 감소, ←가 X 증가)
  //  - Shift 병행 : 미세 이동 (탭 0.1mm / 느린 연속 이동)
  //  - Ctrl+A     : 전체선택
  //  - Ctrl+C / V : 복사 / 붙여넣기
  //  - Ctrl+Z / Y : 실행취소 / 다시실행
  useEffect(() => {
    // 입력 필드(텍스트 편집 중)에서는 단축키 동작을 막지 않는다.
    const isEditableTarget = (e: KeyboardEvent): boolean => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || !!target?.isContentEditable;
    };

    const isArrowKey = (key: string): boolean =>
      key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight';

    /**
     * 연속 이동 루프 — 화살표 키를 누르고 있는 동안 매 프레임 호출된다.
     *
     * 끊김의 원인: 기존 구현은 OS 키 반복(keydown auto-repeat)에만 의존했다.
     * 키 반복은 첫 입력 후 ~0.25~0.5초의 지연이 있고 이후 간격도 불규칙해,
     * "한 칸 → 멈칫 → 띄엄띄엄"하게 움직였다.
     *
     * 해결: 탭(짧게 누름)은 keydown에서 즉시 1스텝 처리하고, NUDGE_HOLD_DELAY
     * 이후에도 키가 눌려 있으면 이 rAF 루프가 프레임 시간(Δt)에 비례한 거리만큼
     * 이동시켜 매 프레임 일정한 속도로 '부드럽게' 흐르도록 한다.
     */
    const runNudgeFrame = (ts: number) => {
      const held = heldArrowsRef.current;
      // 눌린 키가 없으면 루프 종료 + 누적 이동을 한 번에 커밋
      if (held.size === 0) {
        nudgeRafRef.current = null;
        editActionsRef.current.handleNudgeCommit();
        return;
      }

      if (nudgeStartRef.current === 0) nudgeStartRef.current = ts;
      const last = nudgeLastTsRef.current || ts;
      // 탭 전환·백그라운드 복귀 등으로 인한 큰 점프 방지 (Δt 최대 0.1초)
      const dt = Math.min((ts - last) / 1000, 0.1);
      nudgeLastTsRef.current = ts;

      // 누른 직후 잠깐(HOLD_DELAY)은 탭 1스텝만 적용 — 길게 눌러야 연속 이동 시작
      if (ts - nudgeStartRef.current >= NUDGE_HOLD_DELAY && dt > 0) {
        const speed = shiftHeldRef.current ? NUDGE_FINE_SPEED : NUDGE_SPEED;
        const dist = speed * dt;
        const actions = editActionsRef.current;
        let dz = 0;
        let dx = 0;
        if (held.has('ArrowUp')) dz += dist;
        if (held.has('ArrowDown')) dz -= dist;
        // 사용자 X+ 는 화면 좌측 → 화면 우측(→)은 X 감소, 화면 좌측(←)은 X 증가
        if (held.has('ArrowRight')) dx -= dist;
        if (held.has('ArrowLeft')) dx += dist;
        if (dz !== 0) actions.handleNudge('z', dz);
        if (dx !== 0) actions.handleNudge('x', dx);
      }

      nudgeRafRef.current = requestAnimationFrame(runNudgeFrame);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const actions = editActionsRef.current;

      // 화살표 키 이동: ↑/↓ = Z축(상하), ←/→ = 좌우(화면 기준)
      if (isArrowKey(e.key)) {
        if (isEditableTarget(e)) return;
        // 선택된 모델이 없으면 키 입력을 소비하지 않는다 (페이지 기본 동작 허용)
        if (!actions.hasSelection) return;
        e.preventDefault();

        shiftHeldRef.current = e.shiftKey;
        const firstPress = !heldArrowsRef.current.has(e.key);
        heldArrowsRef.current.add(e.key);

        // 탭(첫 입력): 정확한 1스텝 이동 — 미세 위치 조정용
        if (firstPress) {
          const step = e.shiftKey ? NUDGE_FINE_STEP : NUDGE_STEP;
          if (e.key === 'ArrowUp') actions.handleNudge('z', step);
          else if (e.key === 'ArrowDown') actions.handleNudge('z', -step);
          // 화면 우측(→) = 사용자 X 감소, 화면 좌측(←) = 사용자 X 증가
          else if (e.key === 'ArrowRight') actions.handleNudge('x', -step);
          else actions.handleNudge('x', step);
        }

        // 길게 누르는 동안의 연속 이동 루프 시작 (아직 미실행일 때만)
        if (nudgeRafRef.current === null) {
          nudgeStartRef.current = 0;
          nudgeLastTsRef.current = 0;
          nudgeRafRef.current = requestAnimationFrame(runNudgeFrame);
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (isEditableTarget(e)) return;

      switch (e.key.toLowerCase()) {
        case 'a':
          // 텍스트가 선택돼 있으면 일반 전체선택을 허용한다.
          if (window.getSelection()?.toString()) return;
          e.preventDefault();
          actions.handleSelectAll();
          break;
        case 'c':
          // 텍스트가 선택돼 있으면 일반 복사를 허용한다.
          if (window.getSelection()?.toString()) return;
          e.preventDefault();
          actions.handleCopy();
          break;
        case 'v':
          e.preventDefault();
          actions.handlePaste();
          break;
        case 'z':
          e.preventDefault();
          actions.handleUndo();
          break;
        case 'y':
          e.preventDefault();
          actions.handleRedo();
          break;
      }
    };

    // 화살표 키에서 손을 떼면 해당 키를 해제한다. 연속 이동 루프는 다음 프레임에
    // 남은 키가 없음을 감지하면 스스로 멈추고 누적된 이동을 한 번에 커밋한다.
    const onKeyUp = (e: KeyboardEvent) => {
      shiftHeldRef.current = e.shiftKey;
      if (isArrowKey(e.key)) {
        heldArrowsRef.current.delete(e.key);
      }
    };

    // 창이 포커스를 잃으면 keyup을 못 받아 키가 '눌린 채'로 남을 수 있으므로 비운다.
    const onBlur = () => {
      heldArrowsRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (nudgeRafRef.current !== null) {
        cancelAnimationFrame(nudgeRafRef.current);
        nudgeRafRef.current = null;
      }
    };
  }, []);

  /**
   * Slicer 핸들러
   */
  const handleSlice = async (settings: SliceSettings) => {
    if (selectedFiles.length === 0) {
      alert('Please select a model to slice.');
      return;
    }

    // Collect all vertex data from selected meshes
    const allPositions: number[] = [];

    for (const file of selectedFiles) {
      const mesh = meshMapRef.current.get(file.stlId);
      if (!mesh) {
        console.warn(`[ViewerPage] Mesh not found for ${file.fileName}, skipping.`);
        continue;
      }

      // Get vertices (local)
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
      if (!positions) continue;

      // Bake transform and map coordinates
      const worldMatrix = mesh.getWorldMatrix();
      const m = worldMatrix.m;

      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];

        // Transform to World Coordinates
        const wx = x * m[0] + y * m[4] + z * m[8] + m[12];
        const wy = x * m[1] + y * m[5] + z * m[9] + m[13];
        const wz = x * m[2] + y * m[6] + z * m[10] + m[14];

        // Map Babylon World Coordinates (Y-up) to Slicer Coordinates (Z-up)
        // Slicer X = World X
        // Slicer Y = World Z
        // Slicer Z = World Y
        allPositions.push(wx);
        allPositions.push(wz);
        allPositions.push(wy);
      }
    }

    // 선택된 모델에 속한 서포트도 슬라이싱에 포함
    const selectedSupportIds = new Set(
      supports.filter((s) => selectedFileIds.has(s.stlId)).map((s) => s.id)
    );
    const supportMeshes = stlViewerRef.current?.getSupportMeshes() ?? [];
    for (const sm of supportMeshes) {
      if (!selectedSupportIds.has(sm.metadata?.supportId)) continue;

      const positions = sm.getVerticesData(VertexBuffer.PositionKind);
      if (!positions) continue;

      const m = sm.getWorldMatrix().m;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];

        const wx = x * m[0] + y * m[4] + z * m[8] + m[12];
        const wy = x * m[1] + y * m[5] + z * m[9] + m[13];
        const wz = x * m[2] + y * m[6] + z * m[10] + m[14];

        // Babylon(Y-up) → Slicer(Z-up) 매핑 (모델과 동일)
        allPositions.push(wx);
        allPositions.push(wz);
        allPositions.push(wy);
      }
    }

    if (allPositions.length === 0) {
      alert('No valid mesh data found in selected files.');
      return;
    }

    const mergedMeshData = new Float32Array(allPositions);

    setIsSlicing(true);
    setSliceProgress(0);
    setSliceStatus('Initializing...');
    setSlicedLayers([]);

    try {
      const layers = await slicerService.slice(mergedMeshData, settings, (progress) => {
        setSliceProgress(progress.progress);
        setSliceStatus(progress.message);
      });

      setSlicedLayers(layers);
      setLastSliceSettings(settings);
      setSliceStatus('Slicing complete!');
      setSlicerViewMode('2d');
    } catch (err) {
      console.error('Slicing failed:', err);
      setSliceStatus('Slicing failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSlicing(false);
    }
  };

  if (projectLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600 mb-4">Project not found</div>
          <button
            onClick={() => navigate('/projects')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm z-10">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/projects')}
                className="text-gray-600 hover:text-gray-800"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{project.projectName}</h1>
                <p className="text-sm text-gray-600">
                  Project Code: <span className="font-mono">{project.projectCode}</span>
                </p>
              </div>
            </div>

            {/* 파일 업로드 버튼 */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setIsSlicerOpen(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Slicer
              </button>

              <button
                onClick={() => setShowFileBrowser(true)}
                disabled={uploading}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {uploading ? '가져오는 중...' : '+ STL 파일 열기'}
              </button>

              {/* Settings Button */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Settings"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 맞춤 편집 툴바 — 복사 / 붙여넣기 / 실행취소 / 다시실행 */}
        <div className="px-6 py-1.5 border-t border-gray-100">
          <EditToolbar
            onSelectAll={handleSelectAll}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canSelectAll={stlFiles.length > 0}
            canCopy={!!primarySelectedFile}
            canPaste={!!clipboardStlId}
            canHistory={!!primarySelectedFile}
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - STL File List */}
        <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">STL Files</h2>
            {filesLoading ? (
              <div className="text-center text-gray-600 py-4">Loading files...</div>
            ) : (
              <STLFileList
                stlFiles={stlFiles}
                onToggleVisibility={toggleVisibility}
                onDeleteFile={deleteFile}
                onSelectFile={handleFileSelect}
                onClearSelection={handleClearSelection}
                selectedFileIds={selectedFileIds}
              />
            )}
          </div>
        </aside>

        {/* 3D Viewer */}
        <main className="flex-1 relative bg-gray-200">
          <STLViewer
            ref={stlViewerRef}
            stlFiles={stlFiles}
            selectedFileIds={Array.from(selectedFileIds)}
            onMeshSelected={(id) => handleFileSelect(id, false)} // Viewer click selects single
            onBackgroundClick={handleClearSelection} // Click background to deselect
            onGizmoTransformChange={handleGizmoTransformChange}
            onMeshLoaded={handleMeshLoaded} // Store mesh ref
            unselectedOpacity={1} // 선택 시에도 선택되지 않은 STL을 그대로 보이게 유지
            supports={supports}
            supportSettings={supportSettings}
            supportMode={supportMode}
            supportsVisible={supportsVisible}
            onSupportsChange={setSupports}
            className="w-full h-full"
          />

          {/* Viewer Controls */}
          <div className="absolute top-4 right-4">
            <ViewerControls
              onHome={handleHome}
              onResetView={handleResetView}
            />
          </div>
        </main>

        {/* Right Sidebar - Transform / History / Support */}
        <aside className="w-80 bg-white border-l border-gray-200 flex-shrink-0 flex flex-col">
          {/* 탭 헤더 */}
          <div className="flex border-b border-gray-200">
            {([
              { id: 'transform', label: 'Transform' },
              { id: 'history', label: 'History' },
              { id: 'support', label: 'Support' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setRightPanelTab(tab.id)}
                className={`flex-1 px-2 py-3 text-sm font-medium transition-colors ${rightPanelTab === tab.id
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 탭 콘텐츠 */}
          <div className="flex-1 overflow-y-auto">
            {rightPanelTab === 'transform' && (
              <div className="p-4">
                <TransformPanel
                  selectedFile={primarySelectedFile}
                  onTransformChange={handleTransformChange}
                  onPreview={handleTransformPreview}
                  onReset={handleTransformReset}
                />
                {selectedFiles.length > 1 && (
                  <div className="mt-2 text-xs text-blue-600 text-center">
                    Applying to {selectedFiles.length} selected files
                  </div>
                )}
              </div>
            )}
            {rightPanelTab === 'history' && (
              <HistoryViewer
                stlId={primarySelectedFile?.stlId}
                isMaster={user?.role === 'master'}
                className="h-full"
              />
            )}
            {rightPanelTab === 'support' && (
              <SupportPanel
                settings={supportSettings}
                onSettingsChange={setSupportSettings}
                mode={supportMode}
                onModeChange={setSupportMode}
                supportsVisible={supportsVisible}
                onToggleVisible={() => setSupportsVisible((v) => !v)}
                supportCount={supports.length}
                onGeneratePlatform={() => handleGenerateSupports(true)}
                onGenerateAll={() => handleGenerateSupports(false)}
                onClearAll={handleClearSupports}
                onResetSettings={handleResetSupportSettings}
                hasSelection={stlFiles.length > 0}
              />
            )}
          </div>
        </aside>
      </div>


      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        transparency={transparency}
        onTransparencyChange={setTransparency}
      />

      {/* Slicer Modal */}
      {isSlicerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-gray-900 p-6 rounded-lg shadow-xl max-w-6xl w-full h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">Hybrid Slicer</h2>
              <button
                onClick={() => setIsSlicerOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 flex space-x-4 overflow-hidden">
              {/* Left: Settings */}
              <div className="w-80 flex-shrink-0 overflow-y-auto">
                <SlicerPanel
                  onSlice={handleSlice}
                  isSlicing={isSlicing}
                  progress={sliceProgress}
                  statusMessage={sliceStatus}
                />
              </div>

              {/* Right: Preview */}
              <div className="flex-1 bg-black rounded border border-gray-700 flex flex-col overflow-hidden relative">
                {/* View Mode Toggle */}
                <div className="absolute top-4 right-4 z-10 flex space-x-2">
                  <button
                    onClick={() => setSlicerViewMode('3d')}
                    className={`px-3 py-1 rounded text-sm font-medium ${slicerViewMode === '3d'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                  >
                    3D Model
                  </button>
                  <button
                    onClick={() => setSlicerViewMode('2d')}
                    className={`px-3 py-1 rounded text-sm font-medium ${slicerViewMode === '2d'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    disabled={slicedLayers.length === 0}
                  >
                    Sliced Layers
                  </button>
                </div>

                {slicerViewMode === '3d' ? (
                  <div className="w-full h-full">
                    <STLViewer
                      stlFiles={selectedFiles}
                      selectedFileIds={Array.from(selectedFileIds)}
                      className="w-full h-full"
                      unselectedOpacity={1}
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-4">
                    {slicedLayers.length > 0 ? (
                      <SlicePreview
                        layers={slicedLayers}
                        nozzleDiameter={lastSliceSettings?.nozzleDiameter}
                      />
                    ) : (
                      <div className="text-gray-500">
                        No sliced data available. Click "Slice Model" to generate.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Local File Browser */}
      {showFileBrowser && (
        <LocalFileBrowser
          onSelect={handleFilesSelected}
          onClose={() => setShowFileBrowser(false)}
        />
      )}
    </div >
  );
};

export default ViewerPage;
