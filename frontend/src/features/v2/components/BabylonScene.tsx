import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  HighlightLayer,
  Mesh,
  PointerDragBehavior,
  PointerEventTypes,
  PositionGizmo,
  RotationGizmo,
  ScaleGizmo,
  Scene,
  UtilityLayerRenderer,
  Vector3,
} from "@babylonjs/core";

import { loadStlIntoScene } from "../utils/stl-loader";
import { applyOverhangColors } from "../utils/overhang";
import { applyTransformToMesh, readMeshTransform } from "../utils/transform";
import { IDENTITY_TRANSFORM, type TransformV2 } from "../types/transform";
import {
  createSupportMaterial,
  createSupportMesh,
} from "../utils/support-render";
import { autoGenerateSupportPoints } from "../support/utils/auto-generate";
import type { SupportParams, SupportPointV2 } from "../support/types";

export type GizmoMode = "none" | "translate" | "rotate" | "scale";
import {
  addBuildPlateAndGrid,
  type SceneFurniture,
} from "../utils/scene-setup";
import {
  applyViewPreset,
  frameCameraToMeshes,
  resetCameraOnPlate,
  type ViewPreset,
} from "../utils/camera-views";
import type { STLFileV2 } from "../types/stl";

const PLATE_WIDTH_MM = 200;
const PLATE_DEPTH_MM = 125;
const HIGHLIGHT_COLOR = new Color3(1.0, 0.78, 0.18); // 따뜻한 노랑

interface BabylonSceneProps {
  /** 프로젝트의 STL 파일 목록. */
  files: STLFileV2[];
  /** 선택된 STL id 집합. 다중 선택 지원. */
  selectedIds: ReadonlySet<string>;
  /**
   * 씬에서 픽으로 선택 변경됐을 때 부모에 알림.
   * - id == null  → 빈 공간 클릭
   * - opts.multi  → Ctrl/Meta 키 동시 누름 (토글)
   */
  onPick: (id: string | null, opts: { multi: boolean }) => void;
  /** 오버행 임계각 (deg). */
  overhangAngleDeg: number;
  /** Gizmo 모드. 단일 선택일 때만 활성. 'none' 이면 비활성. */
  gizmoMode: GizmoMode;
  /** Gizmo 드래그가 끝났을 때 commit. (start, end) 가 다르면 DB+undo. */
  onGizmoCommit: (id: string, start: TransformV2, end: TransformV2) => void;
  /** 프로젝트의 서포트 점. 추가·삭제 시 자동 동기화. */
  supports: SupportPointV2[];
  /** 서포트 굵기 등 시각화에 쓰는 파라미터. */
  supportParams: SupportParams;
  className?: string;
}

export interface BabylonSceneHandle {
  setView: (preset: ViewPreset) => void;
  fit: () => void;
  /**
   * Transform 드래그 미리보기. DB 저장 없이 메쉬에 즉시 반영.
   * TransformPanel 의 onPreview 가 호출한다.
   */
  previewTransform: (id: string, t: TransformV2) => void;
  /**
   * 모든 STL 메쉬에 대해 자동 서포트 점을 생성해서 반환한다.
   * 저장은 호출 측에서 IndexedDB 에 commit.
   */
  generateAutoSupports: (
    projectId: string,
    params: SupportParams,
  ) => SupportPointV2[];
}

const BabylonScene = forwardRef<BabylonSceneHandle, BabylonSceneProps>(
  function BabylonScene(
    {
      files,
      selectedIds,
      onPick,
      overhangAngleDeg,
      gizmoMode,
      onGizmoCommit,
      supports,
      supportParams,
      className = "",
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const cameraRef = useRef<ArcRotateCamera | null>(null);
    const meshMapRef = useRef<Map<string, Mesh>>(new Map());
    const supportMeshMapRef = useRef<Map<string, Mesh>>(new Map());
    const supportMaterialRef = useRef<ReturnType<
      typeof createSupportMaterial
    > | null>(null);
    const furnitureRef = useRef<SceneFurniture | null>(null);
    const highlightRef = useRef<HighlightLayer | null>(null);
    const utilityLayerRef = useRef<UtilityLayerRenderer | null>(null);
    const positionGizmoRef = useRef<PositionGizmo | null>(null);
    const rotationGizmoRef = useRef<RotationGizmo | null>(null);
    const scaleGizmoRef = useRef<ScaleGizmo | null>(null);
    const gizmoDragStartRef = useRef<{ id: string; t: TransformV2 } | null>(
      null,
    );
    const gizmoModeRef = useRef<GizmoMode>(gizmoMode);
    gizmoModeRef.current = gizmoMode;

    // 최신 값을 effect 바깥에서 참조할 수 있게 ref 로 동기화.
    const overhangRef = useRef<number>(overhangAngleDeg);
    overhangRef.current = overhangAngleDeg;
    const liftRef = useRef<number>(supportParams.liftMm);
    liftRef.current = supportParams.liftMm;
    const selectedRef = useRef<ReadonlySet<string>>(selectedIds);
    selectedRef.current = selectedIds;
    const onPickRef = useRef(onPick);
    onPickRef.current = onPick;
    const onGizmoCommitRef = useRef(onGizmoCommit);
    onGizmoCommitRef.current = onGizmoCommit;

    function refreshHighlight() {
      const hl = highlightRef.current;
      if (!hl) return;
      hl.removeAllMeshes();
      for (const id of selectedRef.current) {
        const mesh = meshMapRef.current.get(id);
        if (mesh) hl.addMesh(mesh, HIGHLIGHT_COLOR);
      }
    }

    /**
     * 모델 위 좌클릭+드래그로 XZ 평면 이동.
     * Y 는 모델의 현재 높이에서 고정 (수직 이동은 Gizmo/슬라이더로).
     */
    function attachDragBehavior(mesh: Mesh, fileId: string) {
      const drag = new PointerDragBehavior({
        dragPlaneNormal: new Vector3(0, 1, 0),
      });
      drag.useObjectOrientationForDragging = false;
      drag.moveAttached = true;

      drag.onDragStartObservable.add(() => {
        gizmoDragStartRef.current = {
          id: fileId,
          t: readMeshTransform(mesh),
        };
      });
      drag.onDragEndObservable.add(() => {
        const started = gizmoDragStartRef.current;
        gizmoDragStartRef.current = null;
        if (!started) return;
        const end = readMeshTransform(mesh);
        onGizmoCommitRef.current(started.id, started.t, end);
      });

      mesh.addBehavior(drag);
    }

    function syncGizmo() {
      const pg = positionGizmoRef.current;
      const rg = rotationGizmoRef.current;
      const sg = scaleGizmoRef.current;
      if (!pg || !rg || !sg) return;

      const sel = Array.from(selectedRef.current);
      const single = sel.length === 1 ? sel[0] : null;
      const mesh = single ? meshMapRef.current.get(single) ?? null : null;
      const mode = gizmoModeRef.current;

      pg.attachedMesh = mode === "translate" ? mesh : null;
      rg.attachedMesh = mode === "rotate" ? mesh : null;
      sg.attachedMesh = mode === "scale" ? mesh : null;
    }

    // 1) 씬 부트스트랩
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      const scene = new Scene(engine);
      scene.clearColor = new Color4(0.94, 0.95, 0.97, 1);
      // 셰이딩이 0 에 가까운 면 (예: cylinder 옆면) 이 새카맣게
      // 보이지 않도록 ambient 를 약간 둔다.
      scene.ambientColor = new Color3(0.45, 0.46, 0.5);

      const camera = new ArcRotateCamera(
        "cam",
        -Math.PI / 4,
        Math.PI / 3,
        300,
        Vector3.Zero(),
        scene,
      );
      camera.attachControl(canvas, true);
      camera.wheelPrecision = 30;
      camera.minZ = 0.1;
      camera.panningSensibility = 50;
      camera.inertia = 0.7;

      const lightTop = new HemisphericLight(
        "lightTop",
        new Vector3(0.2, 1, 0.3),
        scene,
      );
      lightTop.intensity = 0.7;
      lightTop.diffuse = new Color3(1, 1, 1);
      lightTop.specular = new Color3(0.1, 0.1, 0.1);

      const lightBottom = new HemisphericLight(
        "lightBottom",
        new Vector3(0, -1, 0),
        scene,
      );
      lightBottom.intensity = 0.2;

      // 측면 ‘wrap-around’ 보강 — 두 광이 거의 직교라 옆면이 새카맣게
      // 보이는 경우 (cylinder · 둥근 모델) 대응.
      const lightSideA = new HemisphericLight(
        "lightSideA",
        new Vector3(-1, 0.3, 0.4),
        scene,
      );
      lightSideA.intensity = 0.4;
      lightSideA.specular = new Color3(0.05, 0.05, 0.05);

      const lightSideB = new HemisphericLight(
        "lightSideB",
        new Vector3(1, 0.3, -0.4),
        scene,
      );
      lightSideB.intensity = 0.4;
      lightSideB.specular = new Color3(0.05, 0.05, 0.05);

      furnitureRef.current = addBuildPlateAndGrid(scene, {
        widthMm: PLATE_WIDTH_MM,
        depthMm: PLATE_DEPTH_MM,
      });

      supportMaterialRef.current = createSupportMaterial(scene);

      const hl = new HighlightLayer("v2_highlight", scene, {
        blurHorizontalSize: 0.6,
        blurVerticalSize: 0.6,
      });
      hl.innerGlow = false;
      hl.outerGlow = true;
      highlightRef.current = hl;

      // Gizmo: UtilityLayer 위에 세 종류를 한 번씩만 만들고 영속화한다.
      // 모드 전환은 attachedMesh = null/target 로만 처리 → 인스턴스
      // 재생성·콜백 재바인딩 비용이 없다.
      //
      // ⚠️ autoClearDepthAndStencil 은 기본값(true) 유지. false 로
      // 두면 메인 scene 의 depth buffer 가 그대로 남아 gizmo 가
      // 모델 뒤로 가려진다.
      const utility = new UtilityLayerRenderer(scene);

      const positionGizmo = new PositionGizmo(utility);
      const rotationGizmo = new RotationGizmo(utility);
      const scaleGizmo = new ScaleGizmo(utility);

      // 모델이 작을 때 (10mm 단위) 화살표가 묻혀 보이는 걸 막기 위해
      // scaleRatio 를 키운다.
      const SCALE = 1.8;
      positionGizmo.scaleRatio = SCALE;
      rotationGizmo.scaleRatio = SCALE;
      scaleGizmo.scaleRatio = SCALE;

      const onDragStart = () => {
        const sel = Array.from(selectedRef.current);
        if (sel.length !== 1) return;
        const id = sel[0];
        const mesh = meshMapRef.current.get(id);
        if (!mesh) return;
        gizmoDragStartRef.current = { id, t: readMeshTransform(mesh) };
      };
      const onDragEnd = () => {
        const started = gizmoDragStartRef.current;
        gizmoDragStartRef.current = null;
        if (!started) return;
        const mesh = meshMapRef.current.get(started.id);
        if (!mesh) return;
        const end = readMeshTransform(mesh);
        onGizmoCommitRef.current(started.id, started.t, end);
      };
      [positionGizmo, rotationGizmo, scaleGizmo].forEach((giz) => {
        giz.onDragStartObservable.add(onDragStart);
        giz.onDragEndObservable.add(onDragEnd);
      });

      utilityLayerRef.current = utility;
      positionGizmoRef.current = positionGizmo;
      rotationGizmoRef.current = rotationGizmo;
      scaleGizmoRef.current = scaleGizmo;

      // 클릭 픽업: 좌클릭으로 단순 클릭 (드래그 없는) 시 mesh 픽.
      // 메쉬 위면 선택, 빈 공간이면 선택 해제.
      scene.onPointerObservable.add((info) => {
        if (info.type !== PointerEventTypes.POINTERPICK) return;
        const evt = info.event as PointerEvent;
        if (evt.button !== 0) return; // 좌클릭만
        const multi = evt.ctrlKey || evt.metaKey;

        const picked = info.pickInfo?.pickedMesh;
        if (!picked) {
          onPickRef.current(null, { multi });
          return;
        }
        for (const [id, mesh] of meshMapRef.current) {
          if (mesh === picked) {
            onPickRef.current(id, { multi });
            return;
          }
        }
        // 픽된 게 furniture (plate/grid/axes) 면 무시.
      });

      engineRef.current = engine;
      sceneRef.current = scene;
      cameraRef.current = camera;

      resetCameraOnPlate(camera, PLATE_WIDTH_MM, PLATE_DEPTH_MM);

      engine.runRenderLoop(() => scene.render());

      const onResize = () => engine.resize();
      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("resize", onResize);
        positionGizmoRef.current?.dispose();
        rotationGizmoRef.current?.dispose();
        scaleGizmoRef.current?.dispose();
        positionGizmoRef.current = null;
        rotationGizmoRef.current = null;
        scaleGizmoRef.current = null;
        utilityLayerRef.current?.dispose();
        utilityLayerRef.current = null;
        for (const sm of supportMeshMapRef.current.values()) {
          sm.dispose();
        }
        supportMeshMapRef.current.clear();
        supportMaterialRef.current?.dispose();
        supportMaterialRef.current = null;
        for (const mesh of meshMapRef.current.values()) {
          mesh.dispose();
        }
        meshMapRef.current.clear();
        furnitureRef.current?.dispose();
        furnitureRef.current = null;
        hl.dispose();
        highlightRef.current = null;
        scene.dispose();
        engine.dispose();
        engineRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
      };
    }, []);

    // 2) files 변경 시 메쉬 동기화
    useEffect(() => {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!scene || !camera) return;

      let cancelled = false;

      const currentIds = new Set(meshMapRef.current.keys());
      const nextIds = new Set(files.map((f) => f.id));

      for (const id of currentIds) {
        if (!nextIds.has(id)) {
          meshMapRef.current.get(id)?.dispose();
          meshMapRef.current.delete(id);
        }
      }

      const newFiles = files.filter((f) => !currentIds.has(f.id));
      const wasEmpty = currentIds.size === 0;

      Promise.all(
        newFiles.map(async (f) => {
          try {
            const mesh = await loadStlIntoScene(
              scene,
              f.blob,
              f.fileName,
              liftRef.current,
            );
            if (cancelled) {
              mesh.dispose();
              return null;
            }
            applyOverhangColors(mesh, overhangRef.current);
            applyTransformToMesh(mesh, f.transform ?? IDENTITY_TRANSFORM);
            mesh.isPickable = true;
            attachDragBehavior(mesh, f.id);
            meshMapRef.current.set(f.id, mesh);
            return mesh;
          } catch (e) {
            console.error("[v2] STL 로드 실패", f.fileName, e);
            return null;
          }
        }),
      ).then((loaded) => {
        if (cancelled) return;
        if (wasEmpty && loaded.some((m) => m !== null)) {
          frameCameraToMeshes(
            camera,
            loaded.filter((m): m is Mesh => m !== null),
          );
        }
        refreshHighlight();
        // load 가 끝난 뒤에야 mesh 가 존재하므로 여기서 다시 attach.
        syncGizmo();
      });

      // 기존 메쉬들은 transform 변경 가능성 체크
      for (const f of files) {
        if (currentIds.has(f.id)) {
          const mesh = meshMapRef.current.get(f.id);
          if (mesh) {
            applyTransformToMesh(mesh, f.transform ?? IDENTITY_TRANSFORM);
          }
        }
      }

      return () => {
        cancelled = true;
      };
    }, [files]);

    // 3) 임계각 변경 시 모든 메쉬 색 재할당
    useEffect(() => {
      for (const mesh of meshMapRef.current.values()) {
        applyOverhangColors(mesh, overhangAngleDeg);
      }
    }, [overhangAngleDeg]);

    // 3.5) 서포트 점 동기화 — files 와 같은 방식 (신규는 add, 사라진 건 dispose)
    useEffect(() => {
      const scene = sceneRef.current;
      const mat = supportMaterialRef.current;
      if (!scene || !mat) return;

      const currentIds = new Set(supportMeshMapRef.current.keys());
      const nextIds = new Set(supports.map((s) => s.id));

      for (const id of currentIds) {
        if (!nextIds.has(id)) {
          supportMeshMapRef.current.get(id)?.dispose();
          supportMeshMapRef.current.delete(id);
        }
      }

      for (const p of supports) {
        if (currentIds.has(p.id)) continue;
        const m = createSupportMesh(scene, p, supportParams, mat);
        supportMeshMapRef.current.set(p.id, m);
      }
    }, [supports, supportParams]);

    // 4) 선택 변경 시 highlight 갱신
    useEffect(() => {
      refreshHighlight();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIds]);

    // 5) Gizmo: 선택 / 모드 / files 변경 시 attach 재계산
    useEffect(() => {
      syncGizmo();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIds, gizmoMode, files]);

    // 5) 외부 ref API
    useImperativeHandle(
      ref,
      () => ({
        setView(preset) {
          const camera = cameraRef.current;
          if (!camera) return;
          applyViewPreset(camera, preset);
        },
        fit() {
          const camera = cameraRef.current;
          if (!camera) return;
          const meshes = Array.from(meshMapRef.current.values());
          if (meshes.length > 0) {
            frameCameraToMeshes(camera, meshes);
          } else {
            resetCameraOnPlate(camera, PLATE_WIDTH_MM, PLATE_DEPTH_MM);
          }
        },
        previewTransform(id, t) {
          const mesh = meshMapRef.current.get(id);
          if (mesh) applyTransformToMesh(mesh, t);
        },
        generateAutoSupports(projectId, params) {
          const scene = sceneRef.current;
          if (!scene) {
            // eslint-disable-next-line no-console
            console.warn("[v2 auto] scene is null");
            return [];
          }
          // eslint-disable-next-line no-console
          console.log(
            `[v2 auto] meshes in map: ${meshMapRef.current.size}`,
          );
          const out: SupportPointV2[] = [];
          for (const [stlId, mesh] of meshMapRef.current) {
            const pts = autoGenerateSupportPoints(
              scene,
              mesh,
              params,
              projectId,
              stlId,
            );
            out.push(...pts);
          }
          return out;
        },
      }),
      [],
    );

    return (
      <canvas
        ref={canvasRef}
        className={`w-full h-full outline-none ${className}`}
        style={{ display: "block" }}
      />
    );
  },
);

export default BabylonScene;
