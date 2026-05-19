import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Engine, Scene, ArcRotateCamera, Mesh, GizmoManager, UtilityLayerRenderer, IPointerEvent, PointerDragBehavior, Vector3 } from '@babylonjs/core';
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
  centerMeshOnFloor,
  clampMeshAboveFloor,
  arrangeMeshesCentered,
  getTransformFromMesh,
} from '@utils/stl-loader.utils';
import type { STLFile } from '@apptypes/stl.types';
import type { SupportPoint, SupportSettings, SupportMode } from '@apptypes/support.types';
import {
  generateAutoSupports as buildAutoSupports,
  buildSupportMesh,
  getSupportMaterial,
  raycastDown,
} from '@utils/support.utils';

interface STLViewerProps {
  stlFiles: STLFile[];
  selectedFileIds?: string[];  // 선택된 파일 IDs
  onMeshLoaded?: (stlId: string, mesh: Mesh) => void;
  onMeshSelected?: (stlId: string) => void;
  onGizmoTransformChange?: (stlId: string, mesh: Mesh) => void;  // Gizmo 드래그 완료 시
  onBackgroundClick?: () => void; // 배경 클릭 시
  unselectedOpacity?: number; // 선택되지 않은 객체의 투명도 (0~1)
  // 서포트 관련
  supports?: SupportPoint[];           // 렌더링할 서포트 목록
  supportSettings?: SupportSettings;   // 서포트 형상 설정
  supportMode?: SupportMode;           // 'off' | 'add' | 'delete'
  supportsVisible?: boolean;           // 서포트 표시 여부
  onSupportsChange?: (supports: SupportPoint[]) => void; // 수동 추가/삭제 시
  className?: string;
}

/**
 * 부모 컴포넌트에서 카메라를 제어하기 위한 ref 핸들
 */
export interface STLViewerHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  homeView: () => void;
  /** 모델의 오버행을 분석해 자동 서포트 점을 생성한다 */
  generateSupports: (stlId: string, settings: SupportSettings, platformOnly: boolean) => SupportPoint[];
  /** 현재 씬의 서포트 메쉬 목록 (슬라이싱용) */
  getSupportMeshes: () => Mesh[];
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
  supports = [],
  supportSettings,
  supportMode = 'off',
  supportsVisible = true,
  onSupportsChange,
  className = '',
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const meshMapRef = useRef<Map<string, Mesh>>(new Map());
  const utilityLayerRef = useRef<UtilityLayerRenderer | null>(null);
  const gizmoManagerRef = useRef<GizmoManager | null>(null);
  const supportMeshMapRef = useRef<Map<string, Mesh>>(new Map());

  // 포인터 핸들러(한 번만 등록)가 최신 서포트 상태를 참조하도록 ref에 보관
  const supportRtRef = useRef({ mode: supportMode, supports, onSupportsChange });
  supportRtRef.current = { mode: supportMode, supports, onSupportsChange };

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 부모(ViewerPage)에서 호출하는 카메라 제어 메서드 노출
   */
  useImperativeHandle(ref, () => {
    return {
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
      // 초기화: 입력된 모든 STL의 회전을 0으로 되돌리고, 중앙 기준 5mm 간격으로
      //          일렬 배열한 뒤 바닥면에 안착. 카메라(뷰어)는 그대로 둔다.
      resetView: () => {
        // 1) 회전 0 + 중앙 기준 5mm 간격 배열 (바닥면 안착 포함)
        arrangeMeshesCentered(Array.from(meshMapRef.current.values()), 5);
        // 2) 변경된 transform(회전 0 + 배열 위치)을 React 상태/DB에 동기화
        meshMapRef.current.forEach((mesh, stlId) => {
          if (onGizmoTransformChange) {
            onGizmoTransformChange(stlId, mesh);
          }
        });
      },
      // HOME: STL 위치는 그대로 두고 뷰어를 상방에서 수직으로 내려다보는 탑뷰로 전환.
      //       카메라 거리는 빌드스테이지 규격으로부터 계산한 '고정값'이므로
      //       몇 번을 눌러도 줌이 변하지 않는다.
      homeView: () => {
        const camera = cameraRef.current;
        if (!camera) return;

        // 상방에서 수직으로 내려다보는 탑뷰 + 전면(+Z, FRONT 마커)을 화면 하단에 배치
        camera.alpha = Math.PI / 2;
        camera.beta = 0.001; // 0에 근접(정확히 0이면 카메라 방향이 불안정)
        camera.target.set(0, 0, 0);

        // 빌드스테이지 규격(createGrid와 동일) + 양 끝 여유공간 2.5cm가 화면에
        // 담기는 고정 거리 계산. 현재 radius에 의존하지 않아 반복 입력 시에도 불변.
        const STAGE_X = 143.430; // 빌드스테이지 가로(mm)
        const STAGE_Z = 89.6;    // 빌드스테이지 세로(mm)
        const MARGIN = 25;       // 양 끝 여유 공간 2.5cm
        const framedX = STAGE_X + MARGIN * 2;
        const framedZ = STAGE_Z + MARGIN * 2;

        const engine = camera.getEngine();
        const aspect = engine.getRenderWidth() / engine.getRenderHeight();
        const halfFovTan = Math.tan(camera.fov / 2); // fov = 수직 시야각(라디안)
        // 세로(깊이)·가로 각각이 화면에 담기는 거리 중 더 먼 값을 채택
        const radiusForDepth = framedZ / (2 * halfFovTan);
        const radiusForWidth = framedX / (2 * halfFovTan * aspect);
        camera.radius = Math.max(radiusForDepth, radiusForWidth);
      },
      // 자동 서포트 생성: 모델 오버행을 분석해 서포트 점 목록을 반환
      generateSupports: (stlId, settings, platformOnly) => {
        const scene = sceneRef.current;
        const mesh = meshMapRef.current.get(stlId);
        if (!scene || !mesh) return [];
        return buildAutoSupports(
          scene,
          mesh,
          stlId,
          Array.from(meshMapRef.current.values()),
          settings,
          platformOnly
        );
      },
      // 슬라이싱에 포함할 서포트 메쉬 목록
      getSupportMeshes: () => Array.from(supportMeshMapRef.current.values()),
    };
  }, [onGizmoTransformChange]);

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
        gizmoManager.gizmos.positionGizmo.onDragEndObservable.add(() => {
          const attachedMesh = gizmoManager.gizmos.positionGizmo?.attachedMesh;

          if (attachedMesh && onGizmoTransformChange) {
            // 메쉬에서 stlId 찾기
            for (const [stlId, mesh] of meshMapRef.current.entries()) {
              if (mesh === attachedMesh) {
                onGizmoTransformChange(stlId, mesh);
                break;
              }
            }
          }
        });
      }

      // Gizmo 드래그 완료 이벤트 (Rotation)
      if (gizmoManager.gizmos.rotationGizmo) {
        gizmoManager.gizmos.rotationGizmo.onDragEndObservable.add(() => {
          const attachedMesh = gizmoManager.gizmos.rotationGizmo?.attachedMesh;

          if (attachedMesh && onGizmoTransformChange) {
            for (const [stlId, mesh] of meshMapRef.current.entries()) {
              if (mesh === attachedMesh) {
                // 회전으로 바닥면을 침투했으면 위로 안착 (Z 높이를 음수로 둔 경우는 제외)
                if (getTransformFromMesh(mesh).translation.z >= 0) {
                  clampMeshAboveFloor(mesh);
                }
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
        if (pointerInfo.type !== 2) return; // PointerEventTypes.POINTERDOWN
        const event = pointerInfo.event as IPointerEvent;
        if (event.button !== 0) return; // 왼쪽 클릭만 허용

        const pick = pointerInfo.pickInfo;
        const rt = supportRtRef.current;

        // 서포트 추가 모드 — 모델 표면을 클릭해 서포트 직접 추가
        if (rt.mode === 'add') {
          if (pick?.hit && pick.pickedMesh && pick.pickedPoint) {
            let ownerId: string | null = null;
            for (const [id, mesh] of meshMapRef.current.entries()) {
              if (mesh === pick.pickedMesh) { ownerId = id; break; }
            }
            if (ownerId) {
              const cp = pick.pickedPoint;
              const models = Array.from(meshMapRef.current.values());
              const hit = raycastDown(scene, new Vector3(cp.x, cp.y - 0.5, cp.z), models);
              const base = hit && hit.y < cp.y - 0.2 && hit.y > 0.05
                ? { x: hit.x, y: hit.y, z: hit.z }
                : { x: cp.x, y: 0, z: cp.z };
              const newSupport: SupportPoint = {
                id: crypto.randomUUID(),
                stlId: ownerId,
                contact: { x: cp.x, y: cp.y, z: cp.z },
                base,
              };
              rt.onSupportsChange?.([...rt.supports, newSupport]);
            }
          }
          return;
        }

        // 서포트 삭제 모드 — 서포트를 클릭해 개별 삭제
        if (rt.mode === 'delete') {
          const sid = pick?.pickedMesh?.metadata?.supportId as string | undefined;
          if (sid) {
            rt.onSupportsChange?.(rt.supports.filter((s) => s.id !== sid));
          }
          return;
        }

        // 일반 모드 — 모델 선택 / 배경 클릭 해제
        if (pick?.hit && pick.pickedMesh) {
          const pickedMesh = pick.pickedMesh;
          if (onMeshSelected) {
            for (const [stlId, mesh] of meshMapRef.current.entries()) {
              if (mesh === pickedMesh) {
                onMeshSelected(stlId);
                break;
              }
            }
          }
        } else if (onBackgroundClick) {
          onBackgroundClick();
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
            applyTransform(mesh, transformToApply);

            // STL이 처음 입력된 경우(위치 미조정 상태) 빌드스테이지 정중앙 + 바닥면에 배치
            const tr = stlFile.currentTransform.translation;
            const isFreshImport =
              Math.abs(tr.x) < 0.0001 && Math.abs(tr.y) < 0.0001 && Math.abs(tr.z) < 0.0001;
            if (isFreshImport) {
              centerMeshOnFloor(mesh);
            }

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

            // 처음 입력된 STL은 중앙 정렬된 위치를 상태에 동기화 (재적용 시 원위치 방지)
            if (isFreshImport && onGizmoTransformChange) {
              onGizmoTransformChange(stlFile.stlId, mesh);
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
        const transform = stlFile.previewTransform || stlFile.currentTransform;
        applyTransform(mesh, transform);
        // 사용자가 Z(높이) 축에 음수 값을 입력하지 않은 한, 일반 이동·회전으로 인한
        // 바닥면 침투를 차단 (음수 Z 입력 시에는 의도된 침투로 보고 허용)
        if (transform.translation.z >= 0) {
          clampMeshAboveFloor(mesh);
        }
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

  /**
   * 서포트 메쉬 동기화
   * supports/설정이 바뀌면 기존 서포트 메쉬를 모두 제거하고 다시 생성한다.
   */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // 기존 서포트 메쉬 제거
    supportMeshMapRef.current.forEach((mesh) => mesh.dispose());
    supportMeshMapRef.current.clear();

    if (!supportSettings) return;

    const material = getSupportMaterial(scene);
    for (const sp of supports) {
      const mesh = buildSupportMesh(scene, sp, supportSettings, material);
      if (mesh) {
        mesh.isVisible = supportsVisible;
        supportMeshMapRef.current.set(sp.id, mesh);
      }
    }
  }, [supports, supportSettings, supportsVisible]);

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
