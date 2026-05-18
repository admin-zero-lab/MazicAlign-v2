import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Engine, Scene, ArcRotateCamera, Mesh, GizmoManager, UtilityLayerRenderer, IPointerEvent, PointerDragBehavior } from '@babylonjs/core';
import {
  createEngine,
  createScene,
  createCamera,
  createLights,
  createGrid,
  startRenderLoop,
  disposeScene,
  focusOnAllMeshes,
  createUtilityLayer,
  createGizmoManager,
} from '@utils/babylon.utils';
import {
  loadSTLFile,
  applyTransform,
  setMeshVisibility,
  setMeshOpacity,
} from '@utils/stl-loader.utils';
import type { STLFile } from '@types/stl.types';

interface STLViewerProps {
  stlFiles: STLFile[];
  selectedFileIds?: string[];  // 선택된 파일 IDs
  onMeshLoaded?: (stlId: string, mesh: Mesh) => void;
  onMeshSelected?: (stlId: string) => void;
  onGizmoTransformChange?: (stlId: string, mesh: Mesh) => void;  // Gizmo 드래그 완료 시
  onBackgroundClick?: () => void; // 배경 클릭 시
  unselectedOpacity?: number; // 선택되지 않은 객체의 투명도 (0~1)
  className?: string;
}

/**
 * 부모 컴포넌트에서 카메라를 제어하기 위한 ref 핸들
 */
export interface STLViewerHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

/**
 * STL 뷰어 컴포넌트
 * Babylon.js를 사용하여 3D STL 모델 렌더링
 */
const STLViewer = forwardRef<STLViewerHandle, STLViewerProps>(({
  stlFiles,
  selectedFileIds = [],
  onMeshLoaded,
  onMeshSelected,
  onGizmoTransformChange,
  onBackgroundClick,
  unselectedOpacity = 1, // Default to opaque
  className = '',
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const meshMapRef = useRef<Map<string, Mesh>>(new Map());
  const utilityLayerRef = useRef<UtilityLayerRenderer | null>(null);
  const gizmoManagerRef = useRef<GizmoManager | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 부모(ViewerPage)에서 호출하는 카메라 제어 메서드 노출
   */
  useImperativeHandle(ref, () => ({
    // 줌 인: 카메라 거리(radius)를 줄임 (lowerRadiusLimit까지)
    zoomIn: () => {
      const camera = cameraRef.current;
      if (!camera) return;
      const min = camera.lowerRadiusLimit ?? 5;
      camera.radius = Math.max(min, camera.radius * 0.8);
    },
    // 줌 아웃: 카메라 거리(radius)를 늘림 (upperRadiusLimit까지)
    zoomOut: () => {
      const camera = cameraRef.current;
      if (!camera) return;
      const max = camera.upperRadiusLimit ?? 1000;
      camera.radius = Math.min(max, camera.radius * 1.25);
    },
    // 위치 초기화: STL을 검정 중심점(원점) 기준 중앙 + 바닥면 위로 정렬
    resetView: () => {
      // 1) STL 메쉬 위치를 중앙(원점)으로 이동
      meshMapRef.current.forEach((mesh, stlId) => {
        mesh.position.x = 0;
        mesh.position.z = 0;
        mesh.computeWorldMatrix(true);
        // 바닥면(Y=0) 위에 안착하도록 높이 보정
        const minY = mesh.getBoundingInfo().boundingBox.minimumWorld.y;
        mesh.position.y -= minY;
        mesh.computeWorldMatrix(true);
        // 변경된 위치를 React 상태에 동기화 (재적용 시 원위치로 되돌아가는 것 방지)
        if (onGizmoTransformChange) {
          onGizmoTransformChange(stlId, mesh);
        }
      });

      // 2) 카메라를 중앙(원점)으로 정렬
      const camera = cameraRef.current;
      if (!camera) return;
      camera.alpha = Math.PI / 2;
      camera.beta = Math.PI / 3;
      camera.target.set(0, 0, 0);
      let maxDiag = 0;
      meshMapRef.current.forEach((mesh) => {
        const bb = mesh.getBoundingInfo().boundingBox;
        maxDiag = Math.max(maxDiag, bb.maximumWorld.subtract(bb.minimumWorld).length());
      });
      camera.radius = maxDiag > 0 ? Math.max(maxDiag * 1.8, 50) : 50;
    },
  }), [onGizmoTransformChange]);

  /**
   * Babylon.js 초기화
   */
  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      // 엔진 및 씬 생성
      const engine = createEngine(canvasRef.current);
      const scene = createScene(engine);
      const camera = createCamera(scene, canvasRef.current);

      // 조명 설정
      createLights(scene);

      // 렌더링 시작 (clearColor 즉시 적용을 위해 앞으로 이동)
      startRenderLoop(engine, scene);

      // 그리드 생성 (실패해도 렌더링 루프에 영향 없음)
      try {
        createGrid(scene);
      } catch (gridErr) {
        console.warn('[STLViewer] Grid creation failed:', gridErr);
      }

      // Utility Layer 및 Gizmo Manager 생성
      const utilityLayer = createUtilityLayer(scene);
      const gizmoManager = createGizmoManager(scene, utilityLayer);

      // Gizmo 드래그 완료 이벤트 (Position)
      if (gizmoManager.gizmos.positionGizmo) {
        console.log('[STLViewer] Position gizmo drag handler registered');
        gizmoManager.gizmos.positionGizmo.onDragEndObservable.add(() => {
          console.log('[STLViewer] Position gizmo drag ended!');
          const attachedMesh = gizmoManager.gizmos.positionGizmo?.attachedMesh;
          console.log('[STLViewer] Attached mesh:', attachedMesh);
          console.log('[STLViewer] onGizmoTransformChange:', onGizmoTransformChange);

          if (attachedMesh && onGizmoTransformChange) {
            // 메쉬에서 stlId 찾기
            for (const [stlId, mesh] of meshMapRef.current.entries()) {
              if (mesh === attachedMesh) {
                console.log('[STLViewer] Calling onGizmoTransformChange for:', stlId);
                onGizmoTransformChange(stlId, mesh);
                break;
              }
            }
          }
        });
      }

      // Gizmo 드래그 완료 이벤트 (Rotation)
      if (gizmoManager.gizmos.rotationGizmo) {
        console.log('[STLViewer] Rotation gizmo drag handler registered');
        gizmoManager.gizmos.rotationGizmo.onDragEndObservable.add(() => {
          console.log('[STLViewer] Rotation gizmo drag ended!');
          const attachedMesh = gizmoManager.gizmos.rotationGizmo?.attachedMesh;

          if (attachedMesh && onGizmoTransformChange) {
            for (const [stlId, mesh] of meshMapRef.current.entries()) {
              if (mesh === attachedMesh) {
                console.log('[STLViewer] Calling onGizmoTransformChange for:', stlId);
                onGizmoTransformChange(stlId, mesh);
                break;
              }
            }
          }
        });
      }

      // 렌더링 루프는 위에서 이미 시작됨

      // 레퍼런스 저장
      engineRef.current = engine;
      sceneRef.current = scene;
      cameraRef.current = camera;
      utilityLayerRef.current = utilityLayer;
      gizmoManagerRef.current = gizmoManager;

      // 메쉬 클릭 이벤트
      scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.type === 2) { // PointerEventTypes.POINTERDOWN
          if (pointerInfo.pickInfo?.hit && pointerInfo.pickInfo.pickedMesh) {
            // 메쉬 클릭 (왼쪽 클릭만 허용)
            const event = pointerInfo.event as IPointerEvent;
            if (event.button === 0) {
              const pickedMesh = pointerInfo.pickInfo.pickedMesh;
              if (onMeshSelected) {
                // STL ID 찾기
                for (const [stlId, mesh] of meshMapRef.current.entries()) {
                  if (mesh === pickedMesh) {
                    onMeshSelected(stlId);
                    break;
                  }
                }
              }
            }
          } else {
            // 배경 클릭 (왼쪽 클릭인 경우만)
            // pointerInfo.event.button === 0 (Left Click)
            const event = pointerInfo.event as IPointerEvent;
            if (event.button === 0 && onBackgroundClick) {
              onBackgroundClick();
            }
          }
        }
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize viewer';
      setError(errorMessage);
    }

    // 클린업
    return () => {
      if (gizmoManagerRef.current) {
        gizmoManagerRef.current.dispose();
      }
      if (engineRef.current && sceneRef.current) {
        disposeScene(engineRef.current, sceneRef.current);
      }
    };
  }, []);

  /**
   * STL 파일 로드
   */
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current) return;

    const loadFiles = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const scene = sceneRef.current!;
        const camera = cameraRef.current!;

        // 기존 메쉬 중 더 이상 없는 파일 제거
        const currentFileIds = new Set(stlFiles.map(f => f.stlId));
        for (const [stlId, mesh] of meshMapRef.current.entries()) {
          if (!currentFileIds.has(stlId)) {
            mesh.dispose();
            meshMapRef.current.delete(stlId);
          }
        }

        // 새로 추가된 STL 파일만 로드
        for (const stlFile of stlFiles) {
          // 이미 로드된 파일은 스킵
          if (meshMapRef.current.has(stlFile.stlId)) {
            continue;
          }

          // Check if scene is disposed before starting load
          if (scene.isDisposed) {
            console.warn('[STLViewer] Scene disposed, stopping file load');
            break;
          }

          try {
            const mesh = await loadSTLFile(scene, stlFile.originalUrl, stlFile.fileName);

            // Transform 적용 (Preview 우선)
            const transformToApply = stlFile.previewTransform || stlFile.currentTransform;
            console.log(`[STLViewer] Applying transform to ${stlFile.fileName}:`, transformToApply);
            applyTransform(mesh, transformToApply);
            console.log(`[STLViewer] Mesh position after transform:`, mesh.position);

            // 가시성 설정
            setMeshVisibility(mesh, stlFile.visibility);

            // 메쉬 맵에 저장
            meshMapRef.current.set(stlFile.stlId, mesh);

            // 바닥면 드래그 종료 시 transform 상태 동기화
            const dragBehavior = mesh.getBehaviorByName('PointerDrag') as PointerDragBehavior | null;
            if (dragBehavior) {
              const stlId = stlFile.stlId;
              dragBehavior.onDragEndObservable.add(() => {
                if (onGizmoTransformChange) {
                  onGizmoTransformChange(stlId, mesh);
                }
              });
            }

            // 콜백 호출 (Check disposed again)
            if (!scene.isDisposed && onMeshLoaded) {
              onMeshLoaded(stlFile.stlId, mesh);
            }
          } catch (err) {
            console.error(`Failed to load STL file: ${stlFile.fileName}`, err);
          }
        }

        // 모든 메쉬에 카메라 포커스
        if (meshMapRef.current.size > 0) {
          focusOnAllMeshes(camera, scene);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load STL files';

        // Ignore scene disposal errors (user navigated away)
        if (errorMessage.includes('Scene was disposed') || errorMessage.includes('Scene has been disposed')) {
          console.warn('[STLViewer] Load aborted due to scene disposal');
          return;
        }

        setError(errorMessage);
      } finally {
        if (sceneRef.current && !sceneRef.current.isDisposed) {
          setIsLoading(false);
        }
      }
    };

    loadFiles();
  }, [stlFiles.map(f => f.stlId).join(','), onMeshLoaded]); // Only reload when file list changes

  /**
   * Transform 변경 처리 (Preview 및 Current)
   */
  useEffect(() => {
    stlFiles.forEach((stlFile) => {
      const mesh = meshMapRef.current.get(stlFile.stlId);
      if (mesh) {
        // Preview transform이 있으면 우선 사용, 없으면 current transform 사용
        applyTransform(mesh, stlFile.previewTransform || stlFile.currentTransform);
      }
    });
  }, [stlFiles]); // Update transforms when any transform changes

  /**
   * 가시성 변경 처리
   */
  useEffect(() => {
    stlFiles.forEach((stlFile) => {
      const mesh = meshMapRef.current.get(stlFile.stlId);
      if (mesh) {
        setMeshVisibility(mesh, stlFile.visibility);
      }
    });
  }, [stlFiles.map((f) => `${f.stlId}-${f.visibility}`).join(',')]);

  /**
   * 선택된 메쉬에 Gizmo 부착 (바운딩박스 중심으로)
   */
  useEffect(() => {
    if (!gizmoManagerRef.current) return;

    // 선택된 메쉬 가져오기
    const selectedMeshes = Array.from(selectedFileIds)
      .map(id => meshMapRef.current.get(id))
      .filter((mesh): mesh is Mesh => mesh !== undefined);

    if (selectedMeshes.length === 1) {
      // 단일 선택: Gizmo 부착 (Babylon의 attachToMesh는 자동으로 중심에 배치)
      gizmoManagerRef.current.attachToMesh(selectedMeshes[0]);
      // GizmoManager가 attachToMesh 시 자동 부착하는 SixDofDragBehavior(6자유도 자유드래그)
      // 제거 — 회전 및 Z축(상하) 이동을 유발하므로 바닥면 제약 드래그로 대체
      selectedMeshes[0].removeBehavior(gizmoManagerRef.current.boundingBoxDragBehavior);
    } else {
      // 다중 선택 또는 선택 없음: Gizmo 제거
      gizmoManagerRef.current.attachToMesh(null);
    }

    // 본체 자유 드래그(바닥면 XZ 평면 제약, 회전·Z이동 없음)는 선택된 메쉬에서만 활성화
    meshMapRef.current.forEach((mesh, stlId) => {
      const drag = mesh.getBehaviorByName('PointerDrag') as PointerDragBehavior | null;
      if (drag) {
        drag.enabled = selectedFileIds.includes(stlId);
      }
    });

    // 투명도 적용
    // 선택된 파일이 하나라도 있으면, 선택되지 않은 파일은 투명하게 처리
    // 선택된 파일이 없으면, 모든 파일 불투명하게 처리
    const hasSelection = selectedFileIds.length > 0;

    meshMapRef.current.forEach((mesh, stlId) => {
      const isSelected = selectedFileIds.includes(stlId);

      if (!hasSelection) {
        // 선택된 것이 없으면 모두 불투명
        setMeshOpacity(mesh, 1);
      } else if (isSelected) {
        // 선택된 것은 불투명
        setMeshOpacity(mesh, 1);
      } else {
        // 선택되지 않은 것은 설정된 투명도 적용
        setMeshOpacity(mesh, unselectedOpacity);
      }
    });

  }, [selectedFileIds, unselectedOpacity]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full outline-none"
        style={{ background: '#e6e6e6' }}
        tabIndex={0}
        onContextMenu={(e) => e.preventDefault()}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-white text-lg">Loading 3D models...</div>
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-500 text-white p-4 rounded">
          Error: {error}
        </div>
      )}

      {!isLoading && stlFiles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          No STL files to display
        </div>
      )}
    </div>
  );
});

STLViewer.displayName = 'STLViewer';

export default STLViewer;
