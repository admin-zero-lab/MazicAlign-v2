import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Engine, Scene, ArcRotateCamera, Mesh, GizmoManager, UtilityLayerRenderer, IPointerEvent, PointerDragBehavior, PointerEventTypes, Vector3, Plane } from '@babylonjs/core';
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
  highlightMesh,
  centerMeshOnFloor,
  clampMeshAboveFloor,
  arrangeMeshesCentered,
} from '@utils/stl-loader.utils';
import type { STLFile } from '@apptypes/stl.types';
import type { SupportPoint, SupportSettings, SupportMode } from '@apptypes/support.types';
import {
  generateAutoSupports as buildAutoSupports,
  buildSupportMesh,
  buildRaftMesh,
  getSupportMaterial,
  raycastDown,
} from '@utils/support.utils';
import { exportMeshesToSTL } from '@utils/stl-export.utils';

interface STLViewerProps {
  stlFiles: STLFile[];
  selectedFileIds?: string[];  // 선택된 파일 IDs
  onMeshLoaded?: (stlId: string, mesh: Mesh) => void;
  onMeshSelected?: (stlId: string, multiSelect: boolean) => void;
  onGizmoTransformChange?: (stlId: string, mesh: Mesh) => void;  // Gizmo 드래그 완료 시
  onBackgroundClick?: () => void; // 배경 클릭 시
  // 서포트 관련
  supports?: SupportPoint[];           // 렌더링할 서포트 목록
  supportSettings?: SupportSettings;   // 서포트 형상 설정
  supportMode?: SupportMode;           // 'off' | 'add' | 'delete'
  supportsVisible?: boolean;           // 서포트 표시 여부
  onSupportsChange?: (supports: SupportPoint[]) => void; // 수동 추가/삭제 시
  /** 서포트 단계 여부 — true면 모델의 좌클릭 이동(드래그·기즈모)을 잠근다 */
  supportStage?: boolean;
  /**
   * 단면도 표시 — 사용자 Z(수직) 높이(mm). 지정하면 그 높이 이하 부분만 화면에
   * 보이게 잘라낸다(3D 프린트 적층 구조 확인용). null 또는 미지정이면 전체 표시.
   */
  sliceY?: number | null;
  /** 씬 내 모든 모델의 최대 높이(Babylon Y = 사용자 Z)가 바뀔 때 호출 — 단면도 슬라이더 max 동기화용. */
  onSceneMaxHeightChange?: (maxY: number) => void;
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
  /**
   * 모델의 오버행을 분석해 자동 서포트 점을 생성한다.
   * @param layerHeight 슬라이스 기반 섬·공중 시작 검출 간격(mm). 미전달이면 격자 검출만 사용.
   */
  generateSupports: (
    stlId: string,
    settings: SupportSettings,
    platformOnly: boolean,
    layerHeight?: number
  ) => SupportPoint[];
  /** 현재 씬의 서포트 메쉬 목록 (슬라이싱용) */
  getSupportMeshes: () => Mesh[];
  /**
   * 메쉬들을 단일 binary STL Blob 으로 내보낸다.
   * @param stlIds 내보낼 모델의 stlId 목록. 미지정/빈 배열이면 전체. 지정 시 해당
   *               모델 + 그 모델의 서포트 + 그 모델의 가로 빔만 포함된다.
   */
  exportSTL: (stlIds?: string[]) => Blob;
  /**
   * 모델의 현재 자세(회전 포함)에서 가장 낮은 표면점의 Babylon Y 값을 반환한다.
   * Support 탭의 'Z축 이동 높이'를 모델의 실제 바닥 기준으로 적용하기 위한 정보.
   */
  getMinY: (stlId: string) => number | null;
  /** 모델 월드 AABB 의 X·Z 너비(mm)를 반환. STL 크기 기반 자동 사이징용. */
  getMeshHorizSize: (stlId: string) => { width: number; depth: number } | null;
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
  supports = [],
  supportSettings,
  supportMode = 'off',
  supportsVisible = true,
  onSupportsChange,
  supportStage = false,
  sliceY = null,
  onSceneMaxHeightChange,
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
  const supportRtRef = useRef({ mode: supportMode, supports, onSupportsChange, supportStage });
  supportRtRef.current = { mode: supportMode, supports, onSupportsChange, supportStage };

  // 기즈모/드래그 dragEnd 콜백은 Babylon 초기화 effect에서 한 번만 등록된다.
  // 그 시점의 onGizmoTransformChange를 그대로 closure에 가두면 첫 렌더의 빈 stlFiles만
  // 보게 되어 stlFiles.find 결과가 항상 undefined가 된다(=> "File not found", 회전
  // 동의 분기 진입 불가). 매 렌더 최신 함수를 호출하도록 ref에 갱신해 사용한다.
  const onGizmoTransformChangeRef = useRef(onGizmoTransformChange);
  onGizmoTransformChangeRef.current = onGizmoTransformChange;

  // Babylon 초기화 effect 안에서 등록한 window 레벨 리스너의 해제 함수 모음 —
  // useEffect cleanup 단계에서 일괄 호출.
  const cleanupFnsRef = useRef<Array<() => void>>([]);

  // 다중 선택 드래그 시 다른 모델도 함께 이동시키기 위해 최신 selectedFileIds 를 ref 로 유지.
  const selectedFileIdsRef = useRef<string[]>(selectedFileIds);
  selectedFileIdsRef.current = selectedFileIds;

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
          onGizmoTransformChangeRef.current?.(stlId, mesh);
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
      generateSupports: (stlId, settings, platformOnly, layerHeight) => {
        const scene = sceneRef.current;
        const mesh = meshMapRef.current.get(stlId);
        if (!scene || !mesh) return [];
        return buildAutoSupports(
          scene,
          mesh,
          stlId,
          Array.from(meshMapRef.current.values()),
          settings,
          platformOnly,
          layerHeight ?? 0
        );
      },
      // 슬라이싱에 포함할 서포트 메쉬 목록 — 개별 서포트(tip+conn+pillar+foot 병합),
      // 각 메쉬의 metadata.stlId 로 소유 모델을 식별할 수 있다.
      getSupportMeshes: () => [...supportMeshMapRef.current.values()],
      // 모델 월드 AABB 의 X·Z 너비. 자동 사이징용 — 모델 X·Z 외형 크기.
      getMeshHorizSize: (stlId) => {
        const mesh = meshMapRef.current.get(stlId);
        if (!mesh) return null;
        mesh.computeWorldMatrix(true);
        const bb = mesh.getBoundingInfo().boundingBox;
        return {
          width: bb.maximumWorld.x - bb.minimumWorld.x,
          depth: bb.maximumWorld.z - bb.minimumWorld.z,
        };
      },
      // 모델의 현재 자세에서 가장 낮은 표면점의 Babylon Y 값 (8 코너 직접 변환).
      getMinY: (stlId) => {
        const mesh = meshMapRef.current.get(stlId);
        if (!mesh) return null;
        mesh.computeWorldMatrix(true);
        const bi = mesh.getBoundingInfo();
        const lmin = bi.minimum;
        const lmax = bi.maximum;
        const wm = mesh.getWorldMatrix();
        const v = new Vector3();
        let minY = Infinity;
        for (const x of [lmin.x, lmax.x])
          for (const y of [lmin.y, lmax.y])
            for (const z of [lmin.z, lmax.z]) {
              Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, wm, v);
              if (v.y < minY) minY = v.y;
            }
        return minY === Infinity ? null : minY;
      },
      // 모델·서포트·가로 빔을 모아 binary STL 으로 내보낸다. stlIds 가 지정되면 해당
      // 모델만 + 그 모델의 서포트·빔만 포함 (선택 모델 내보내기).
      exportSTL: (stlIds) => {
        const filter = stlIds && stlIds.length > 0 ? new Set(stlIds) : null;
        const all: Mesh[] = [];
        meshMapRef.current.forEach((mesh, id) => {
          if (!filter || filter.has(id)) all.push(mesh);
        });
        supportMeshMapRef.current.forEach((mesh) => {
          const sid = mesh.metadata?.stlId as string | undefined;
          if (sid && (!filter || filter.has(sid))) all.push(mesh);
        });
        return exportMeshesToSTL(all);
      },
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

      // 매 프레임 바닥 통과 방지 — 어떤 경로(회전/위치 기즈모, PointerDrag, slider 등)
      // 로든 모델 일부가 빌드플레이트(Y=0) 아래로 내려가면 즉시 위로 안착시킨다.
      // 사용자 요구: "Z축 이동값을 설정하지 않은 한 음수 Z 이동은 제한" — 입력 단계
      // (TransformPanel)에서 음수 자체를 막고, 여기서는 무조건 clamp 한다.
      scene.onBeforeRenderObservable.add(() => {
        meshMapRef.current.forEach((mesh) => {
          clampMeshAboveFloor(mesh);
        });
      });

      // Gizmo 드래그 완료 이벤트 (Position)
      if (gizmoManager.gizmos.positionGizmo) {
        gizmoManager.gizmos.positionGizmo.onDragEndObservable.add(() => {
          const attachedMesh = gizmoManager.gizmos.positionGizmo?.attachedMesh;
          if (!attachedMesh) return;
          // 메쉬에서 stlId 찾기
          for (const [stlId, mesh] of meshMapRef.current.entries()) {
            if (mesh === attachedMesh) {
              onGizmoTransformChangeRef.current?.(stlId, mesh);
              break;
            }
          }
        });
      }

      // Gizmo 드래그 — Rotation
      if (gizmoManager.gizmos.rotationGizmo) {
        // 드래그 *중*에도 매 프레임 바닥 침투 방지 — 회전이 진행되면서 모델 일부가
        // Z=0(빌드플레이트) 아래로 내려가는 즉시 위로 안착시킨다 (사용자 요구:
        // "STL 회전 시 Z축 영점을 통과하지 않을 것").
        gizmoManager.gizmos.rotationGizmo.onDragObservable.add(() => {
          const attached = gizmoManager.gizmos.rotationGizmo?.attachedMesh;
          if (!attached) return;
          clampMeshAboveFloor(attached as Mesh);
        });
        gizmoManager.gizmos.rotationGizmo.onDragEndObservable.add(() => {
          const attachedMesh = gizmoManager.gizmos.rotationGizmo?.attachedMesh;
          if (!attachedMesh) return;
          for (const [stlId, mesh] of meshMapRef.current.entries()) {
            if (mesh === attachedMesh) {
              clampMeshAboveFloor(mesh);
              onGizmoTransformChangeRef.current?.(stlId, mesh);
              break;
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

      // 좌클릭 드래그만 모델 이동/회전을 트리거하도록 한다.
      // Babylon 의 PointerDragBehavior(바닥면 이동)와 GizmoManager가 자동 부착하는
      // boundingBoxDragBehavior(SixDof) 는 모두 어떤 마우스 버튼이든 드래그를 시작
      // 한다. 그래서 Transform 단계에서 모델 선택 후 우클릭 드래그(=카메라 회전)
      // 만 하려 해도 두 behavior 가 동시에 트리거되어 모델이 함께 이동·회전된다.
      // 우클릭/휠클릭 down 시점에 mesh 의 모든 behavior 를 잠시 비활성화하고
      // up 시점에 원상복구해, 좌클릭이 아닌 입력으로는 어떤 동작도 시작되지
      // 않도록 봉쇄한다. (insertFirst=true 로 가장 먼저 실행)
      const lockKey = '__behaviorsSavedEnabled';
      const pickableLockKey = '__isPickableSaved';
      // 우클릭/휠클릭 down 시 잠가야 할 기즈모 axis 의 PointerDragBehavior 목록을 모은다.
      // (positionGizmo·rotationGizmo 의 x/y/z 핸들. utility layer 메쉬라
      //  meshMapRef.forEach 로는 닿지 않으므로 별도로 잠금)
      const collectGizmoDragBehaviors = (): Array<{ enabled?: boolean }> => {
        const gm = gizmoManagerRef.current;
        if (!gm) return [];
        const result: Array<{ enabled?: boolean }> = [];
        const groups = [gm.gizmos.positionGizmo, gm.gizmos.rotationGizmo];
        for (const gz of groups) {
          if (!gz) continue;
          const subs = [
            (gz as unknown as { xGizmo?: { dragBehavior?: { enabled?: boolean } } }).xGizmo,
            (gz as unknown as { yGizmo?: { dragBehavior?: { enabled?: boolean } } }).yGizmo,
            (gz as unknown as { zGizmo?: { dragBehavior?: { enabled?: boolean } } }).zGizmo,
          ];
          for (const sub of subs) {
            if (sub?.dragBehavior) result.push(sub.dragBehavior);
          }
        }
        return result;
      };
      let gizmoDragSaved: boolean[] | null = null;
      scene.onPointerObservable.add((pointerInfo) => {
        const ev = pointerInfo.event as IPointerEvent;
        if (pointerInfo.type === PointerEventTypes.POINTERDOWN && ev.button !== 0) {
          meshMapRef.current.forEach((mesh) => {
            const saved: boolean[] = [];
            mesh.behaviors.forEach((b) => {
              const bw = b as unknown as { enabled?: boolean };
              saved.push(bw.enabled !== false);
              bw.enabled = false;
            });
            (mesh as unknown as Record<string, unknown>)[lockKey] = saved;
            // 추가 안전망 — 우/휠 down 동안 모델을 picking 불가능하게 만들어,
            // GizmoManager 내부 ray·pick 같은 다른 경로로도 모델의 X/Y/Z 이동·회전이
            // 트리거되지 않게 한다. up 시 원상복구.
            (mesh as unknown as Record<string, unknown>)[pickableLockKey] = mesh.isPickable;
            mesh.isPickable = false;
          });
          // 기즈모 axis dragBehavior 도 함께 잠근다 — 우클릭으로 모델 회전이
          // 일어나던 회귀("좌클릭 후 우클릭을 통해 회전 가능") 차단.
          const gdb = collectGizmoDragBehaviors();
          gizmoDragSaved = gdb.map((d) => d.enabled !== false);
          gdb.forEach((d) => { d.enabled = false; });
        } else if (pointerInfo.type === PointerEventTypes.POINTERUP && ev.button !== 0) {
          meshMapRef.current.forEach((mesh) => {
            const bag = mesh as unknown as Record<string, unknown>;
            const saved = bag[lockKey] as boolean[] | undefined;
            if (saved) {
              mesh.behaviors.forEach((b, i) => {
                const bw = b as unknown as { enabled?: boolean };
                if (typeof saved[i] === 'boolean') bw.enabled = saved[i];
              });
              delete bag[lockKey];
            }
            // isPickable 복원
            const pickSaved = bag[pickableLockKey];
            if (typeof pickSaved === 'boolean') {
              mesh.isPickable = pickSaved;
              delete bag[pickableLockKey];
            }
          });
          if (gizmoDragSaved) {
            const gdb = collectGizmoDragBehaviors();
            gdb.forEach((d, i) => {
              if (typeof gizmoDragSaved![i] === 'boolean') d.enabled = gizmoDragSaved![i];
            });
            gizmoDragSaved = null;
          }
        }
      }, undefined, true);

      // 메쉬 클릭 이벤트
      scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) return;
        const event = pointerInfo.event as IPointerEvent;
        if (event.button !== 0) return; // 왼쪽 클릭만 허용

        const pick = pointerInfo.pickInfo;
        const rt = supportRtRef.current;

        // 서포트 추가/삭제는 Support 단계에서만 동작한다. Transform 단계로 돌아온 뒤
        // supportMode가 'add'/'delete'로 남아 있어도 좌클릭이 서포트를 생성·삭제하지
        // 않도록 무시한다 (Transform·Support 동작의 철저한 분리).
        const mode = rt.supportStage ? rt.mode : 'off';

        // 서포트 추가 모드 — 모델 표면을 클릭해 서포트 직접 추가
        if (mode === 'add') {
          if (pick?.hit && pick.pickedMesh && pick.pickedPoint) {
            let ownerId: string | null = null;
            for (const [id, mesh] of meshMapRef.current.entries()) {
              if (mesh === pick.pickedMesh) { ownerId = id; break; }
            }
            if (ownerId) {
              const cp = pick.pickedPoint;
              const models = Array.from(meshMapRef.current.values());
              const hit = raycastDown(scene, new Vector3(cp.x, cp.y - 0.5, cp.z), models);
              // 클릭 위치 표면의 외향 법선 (월드) — 콘이 표면 90° 박힘 + 자동 서포트와
              // 일관된 모양. n.y < -0.05 (아래 향함) 이고 빌드플레이트 착지 케이스에만 활용.
              const wn = pick.getNormal(true, true);
              const useNormal = wn && wn.y < -0.05 && !(hit && hit.y > 0.05 && hit.y < cp.y - 0.2);
              const L = supportSettings?.connectionLength ?? 3;
              const normal = useNormal ? { x: wn.x, y: wn.y, z: wn.z } : undefined;
              const base = hit && hit.y < cp.y - 0.2 && hit.y > 0.05
                ? { x: hit.x, y: hit.y, z: hit.z } // 모델 위 착지 — 수직
                : normal
                  ? { x: cp.x + normal.x * L, y: 0, z: cp.z + normal.z * L } // 빌드플레이트 + 법선 이동
                  : { x: cp.x, y: 0, z: cp.z }; // fallback 수직
              const newSupport: SupportPoint = {
                id: crypto.randomUUID(),
                stlId: ownerId,
                contact: { x: cp.x, y: cp.y, z: cp.z },
                base,
                normal,
              };
              rt.onSupportsChange?.([...rt.supports, newSupport]);
            }
          }
          return;
        }

        // 서포트 삭제 모드 — 서포트를 클릭해 개별 삭제
        if (mode === 'delete') {
          const sid = pick?.pickedMesh?.metadata?.supportId as string | undefined;
          if (sid) {
            rt.onSupportsChange?.(rt.supports.filter((s) => s.id !== sid));
          }
          return;
        }

        // 일반 모드 — 모델 선택 / 배경 클릭 해제
        if (pick?.hit && pick.pickedMesh) {
          const pickedMesh = pick.pickedMesh;
          // 클릭된 메쉬의 소유 모델(stlId, ownerMesh) 식별 — 서포트 메쉬를 클릭하면
          // 결합된 소유 모델로 매핑한다 (모델+서포트 = 한 파일).
          let ownerStlId: string | undefined = pickedMesh.metadata?.stlId as string | undefined;
          let ownerMesh: Mesh | undefined;
          if (ownerStlId && meshMapRef.current.has(ownerStlId)) {
            ownerMesh = meshMapRef.current.get(ownerStlId);
          } else {
            ownerStlId = undefined;
            for (const [stlId, mesh] of meshMapRef.current.entries()) {
              if (mesh === pickedMesh) { ownerStlId = stlId; ownerMesh = mesh; break; }
            }
          }
          if (onMeshSelected && ownerStlId) {
            const ctrlHeld = !!(event.ctrlKey || event.metaKey);
            const alreadySelected = selectedFileIdsRef.current.includes(ownerStlId);
            // 이미 다중 선택에 포함된 모델을 단순 좌클릭(Ctrl 없이)하면 selection 을
            // 그대로 유지한다 — 그래야 그 모델을 잡고 드래그할 때 다른 선택 모델도
            // 함께 이동할 수 있다. Ctrl+클릭은 토글, 미포함 단순 클릭은 단일 선택.
            if (ctrlHeld || !alreadySelected) {
              onMeshSelected(ownerStlId, ctrlHeld);
            }
          }
          // 모델 위 좌클릭 드래그(이동)는 PointerDragBehavior 가 자동 시작·종료한다
          // (stl-loader: startAndReleaseDragOnPointerEvents=true, detachCameraControls=true).
          // 빈 영역 좌클릭 드래그는 카메라 회전 — 별도 처리 없이 ArcRotateCamera 가 담당.
          void ownerMesh;
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
      cleanupFnsRef.current.forEach((fn) => fn());
      cleanupFnsRef.current = [];
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

            // 바닥면 드래그 종료 시 transform 상태 동기화. 다중 선택 시에는 함께
            // 이동한 다른 메쉬들의 transform 도 함께 커밋한다.
            const dragBehavior = mesh.getBehaviorByName('PointerDrag') as PointerDragBehavior | null;
            if (dragBehavior) {
              const stlId = stlFile.stlId;

              // 다중 선택 동기 이동 — 이 메쉬가 끌릴 때 같은 선택 그룹의 다른 메쉬도
              // 같은 X·Z delta 만큼 함께 옮긴다. (다중 선택 드래그가 단일 모델만
              // 끌고 가는 회귀 차단)
              dragBehavior.onDragObservable.add((evt) => {
                const ids = selectedFileIdsRef.current;
                if (ids.length <= 1 || !ids.includes(stlId)) return;
                for (const otherId of ids) {
                  if (otherId === stlId) continue;
                  const other = meshMapRef.current.get(otherId);
                  if (!other) continue;
                  other.position.x += evt.delta.x;
                  other.position.z += evt.delta.z;
                }
              });

              dragBehavior.onDragEndObservable.add(() => {
                // 본인 + 함께 끌려간 모든 선택 모델의 transform 을 한꺼번에 커밋
                const ids = selectedFileIdsRef.current;
                const targets = ids.length > 1 && ids.includes(stlId) ? ids : [stlId];
                for (const id of targets) {
                  const m = meshMapRef.current.get(id);
                  if (m) onGizmoTransformChangeRef.current?.(id, m);
                }
              });
            }

            // 처음 입력된 STL은 중앙 정렬된 위치를 상태에 동기화 (재적용 시 원위치 방지)
            if (isFreshImport) {
              onGizmoTransformChangeRef.current?.(stlFile.stlId, mesh);
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
   * Transform 변경 처리 (Preview 및 Current) — 메쉬 위치를 갱신한 뒤 씬 내 모델의
   * 최대 높이(Babylon Y = 사용자 Z)를 계산해 부모에게 알린다. 단면도 슬라이더 max
   * 값을 동적으로 맞추기 위한 정보다.
   */
  useEffect(() => {
    let maxY = 0;
    stlFiles.forEach((stlFile) => {
      const mesh = meshMapRef.current.get(stlFile.stlId);
      if (mesh) {
        const transform = stlFile.previewTransform || stlFile.currentTransform;
        applyTransform(mesh, transform);
        clampMeshAboveFloor(mesh); // 음수 Z 입력은 TransformPanel 에서 차단됨
        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo();
        const top = mesh.getBoundingInfo().boundingBox.maximumWorld.y;
        if (top > maxY) maxY = top;
      }
    });
    onSceneMaxHeightChange?.(maxY);
  }, [stlFiles, onSceneMaxHeightChange]);

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

    // 단면도(sliceY != null) 활성 시에는 메쉬 일부가 시각적으로 잘려도 picking
    // 영역은 그대로라, 보이지 않는 부분을 클릭하면 모델이 잘못 끌려가는 충돌이
    // 발생한다. 단면도 동안에는 Gizmo·PointerDrag 모두 잠가 보기 전용으로 둔다.
    const sliceLocked = sliceY != null;
    if (selectedMeshes.length === 1 && !supportStage && !sliceLocked) {
      // 단일 선택: Gizmo 부착 (Babylon의 attachToMesh는 자동으로 중심에 배치)
      gizmoManagerRef.current.attachToMesh(selectedMeshes[0]);
      // GizmoManager가 attachToMesh 시 자동 부착하는 SixDofDragBehavior(6자유도 자유드래그)
      // 제거 — 회전 및 Z축(상하) 이동을 유발하므로 바닥면 제약 드래그로 대체
      selectedMeshes[0].removeBehavior(gizmoManagerRef.current.boundingBoxDragBehavior);
    } else {
      // 다중 선택 / 선택 없음 / 서포트 단계 / 단면도 활성: Gizmo 제거
      gizmoManagerRef.current.attachToMesh(null);
    }

    // 선택이 바뀔 때 — releaseDrag 는 호출하지 않는다.
    // 좌클릭 POINTERDOWN 에서 onMeshSelected 가 setSelectedFileIds 를 트리거하면
    // 이 effect 가 같은 React 배치에서 실행되는데, PointerDragBehavior 가 같은
    // POINTERDOWN 에서 자동으로 startDrag 한 직후라 여기서 releaseDrag 를 호출하면
    // 좌클릭 드래그가 항상 즉시 종료되어 모델이 따라오지 않는다 (사용자 보고:
    // "좌클릭 후 드래그 이동 안됨"). 잔여 정리는 POINTERUP / 우·휠 down 가드에서 처리.

    // 좌클릭 드래그 허용 조건 — Transform 단계와 Support 일반(off) 모드는 동일하게
    // 좌클릭 드래그로 모델 이동 가능. Support 의 add/delete 모드에서만 잠근다
    // (그때는 좌클릭이 서포트 추가·삭제 작업이라 동시에 드래그가 시작되면 곤란).
    const dragLockedByMode = supportStage && supportMode !== 'off';
    meshMapRef.current.forEach((mesh, stlId) => {
      const isSelected = selectedFileIds.includes(stlId);
      const drag = mesh.getBehaviorByName('PointerDrag') as PointerDragBehavior | null;
      // 단면도 활성 동안에는 PointerDrag 도 잠근다 (보이지 않는 영역 클릭으로 인한
      // 점프 충돌 봉쇄).
      if (drag) drag.enabled = !dragLockedByMode && !sliceLocked;
      highlightMesh(mesh, isSelected);
    });

  }, [selectedFileIds, supportStage, supportMode, sliceY]);

  /**
   * 서포트 메쉬 동기화 — supports/설정 변경 시에만 메쉬를 재생성한다.
   * supportStage 만 토글된 경우 메쉬를 재생성하지 않고, 아래 effect 에서 setParent
   * 만 토글한다. (재생성 시 sp.contact/base 가 옛 월드 좌표라 모델 이동 후 Support
   * 진입 시 서포트가 원래 좌표로 점프하는 회귀 차단)
   */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // 기존 서포트 메쉬 제거
    supportMeshMapRef.current.forEach((mesh) => mesh.dispose());
    supportMeshMapRef.current.clear();

    if (!supportSettings) return;

    const material = getSupportMaterial(scene);

    // SLA 서포트 — 각 접점에서 빌드플레이트로 내려가는 단순 구조.
    for (const sp of supports) {
      const mesh = buildSupportMesh(scene, sp, supportSettings, material);
      if (mesh) {
        mesh.isVisible = supportsVisible;
        const owner = meshMapRef.current.get(sp.stlId);
        if (owner) mesh.setParent(owner);
        supportMeshMapRef.current.set(sp.id, mesh);
      }
    }

    // 라프트 — 서포트가 있는 모델별로 1개. 빌드플레이트 고정(부모 결합 안 함).
    if (supportSettings.raftEnabled) {
      const stlIdsWithSupport = new Set(supports.map((s) => s.stlId));
      for (const stlId of stlIdsWithSupport) {
        const owner = meshMapRef.current.get(stlId);
        if (!owner) continue;
        const raft = buildRaftMesh(scene, owner, supportSettings, material);
        if (raft) {
          raft.isVisible = supportsVisible;
          supportMeshMapRef.current.set(raft.name, raft);
        }
      }
    }
    // ⚠ supportStage 는 의도적으로 deps 에서 제외 — 단계 전환만으로는 메쉬를 재생성
    //   하지 않는다. 결합 토글은 아래 별도 effect 가 담당.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supports, supportSettings, supportsVisible]);

  /**
   * 단계 전환 시 결합 보장 — Transform/Support 모두 모델 자식으로 유지한다.
   * (Support 단계에서도 모델 이동 시 서포트가 함께 따라가야 한다는 사용자 요구)
   * 이미 자식이면 setParent(owner)는 no-op 에 가깝고, 모델 메쉬가 바뀐 케이스
   * (재로드 등)에서도 안전하게 재결합한다.
   */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    supportMeshMapRef.current.forEach((mesh) => {
      const stlId = mesh.metadata?.stlId as string | undefined;
      if (!stlId) return;
      const owner = meshMapRef.current.get(stlId);
      if (owner) mesh.setParent(owner);
    });
  }, [supportStage]);

  /**
   * 단면도(Slice) — 사용자 Z(=Babylon Y) 높이 이하 부분만 보이도록 clipPlane 설정.
   * sliceY 가 null 이면 클리핑 해제(전체 표시). 적층 구조 확인용으로 Transform/Support
   * 양쪽 단계 모두에서 동작한다.
   */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (sliceY == null) {
      scene.clipPlane = null;
      return;
    }
    // Plane(0,1,0,-sliceY): y > sliceY 영역을 클립 → 그 아래(누적된 적층 부분)만 보임.
    scene.clipPlane = new Plane(0, 1, 0, -sliceY);
  }, [sliceY]);

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
