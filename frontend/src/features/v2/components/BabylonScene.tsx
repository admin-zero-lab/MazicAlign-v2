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
  LinesMesh,
  Mesh,
  MeshBuilder,
  Plane,
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
import { meshesToStlBlob } from "../utils/stl-export";
import { chainSegments, sliceMeshAtY } from "../utils/slice-section";
import {
  buildPolygonFillMesh,
  createSliceFillMaterial,
} from "../utils/slice-render";
import {
  rasterizePolygons,
  type SliceMask,
} from "../utils/slice-rasterize";
import type { SupportParams, SupportPointV2 } from "../support/types";
import type { EditMode } from "./EditModeControls";

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
  /** 'select' / 'support' — 모드별 픽·드래그·Gizmo 동작. */
  editMode: EditMode;
  /** 'support' 모드에서 모델 표면 픽 시 → 그 위치에 서포트 추가. */
  onAddSupportAt: (
    stlId: string,
    contact: [number, number, number],
  ) => void;
  /**
   * 'support' 모드에서 기둥 픽 시 선택, 빈 공간 픽 시 null.
   * 삭제는 Delete 키 / UI 버튼으로 분리.
   */
  onPickSupport: (supportId: string | null) => void;
  /** 현재 선택된 기둥 id (highlight 표시용). */
  selectedSupportId: string | null;
  /**
   * Z 슬라이스 미리보기 높이 (mm). null 이면 비활성.
   * 활성 시 Y > sliceY 영역의 메쉬가 잘려 단면이 보인다.
   */
  sliceY: number | null;
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
  /**
   * 현재 씬의 STL + 서포트 메쉬를 합쳐 binary STL Blob 으로 반환.
   * 모델이 0 개면 null.
   */
  exportStl: () => Blob | null;
  /**
   * 주어진 sliceY 의 단면을 width × height 픽셀의 1bpp 마스크로.
   * 모든 STL + 서포트의 union.
   */
  getSliceMask: (
    sliceY: number,
    widthPx: number,
    heightPx: number,
  ) => SliceMask;
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
      editMode,
      onAddSupportAt,
      onPickSupport,
      selectedSupportId,
      sliceY,
      className = "",
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const cameraRef = useRef<ArcRotateCamera | null>(null);
    const meshMapRef = useRef<Map<string, Mesh>>(new Map());
    const dragBehaviorMapRef = useRef<Map<string, PointerDragBehavior>>(
      new Map(),
    );
    const supportMeshMapRef = useRef<Map<string, Mesh>>(new Map());
    const supportMaterialRef = useRef<ReturnType<
      typeof createSupportMaterial
    > | null>(null);
    const sliceOutlineRef = useRef<LinesMesh | null>(null);
    const sliceFillMeshesRef = useRef<Mesh[]>([]);
    const sliceModelMatRef = useRef<ReturnType<
      typeof createSliceFillMaterial
    > | null>(null);
    const sliceSupportMatRef = useRef<ReturnType<
      typeof createSliceFillMaterial
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
    const editModeRef = useRef<EditMode>(editMode);
    editModeRef.current = editMode;
    const onAddSupportRef = useRef(onAddSupportAt);
    onAddSupportRef.current = onAddSupportAt;
    const onPickSupportRef = useRef(onPickSupport);
    onPickSupportRef.current = onPickSupport;
    const selectedSupportRef = useRef<string | null>(selectedSupportId);
    selectedSupportRef.current = selectedSupportId;
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
      const sSel = selectedSupportRef.current;
      if (sSel) {
        const sMesh = supportMeshMapRef.current.get(sSel);
        if (sMesh) hl.addMesh(sMesh, HIGHLIGHT_COLOR);
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

      // 'support' 모드면 attach 보류 (mode effect 가 attach).
      if (editModeRef.current === "select") {
        mesh.addBehavior(drag);
      }
      dragBehaviorMapRef.current.set(fileId, drag);
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

      // 'support' 모드면 Gizmo 강제 detach.
      const allow = editModeRef.current === "select";
      pg.attachedMesh = allow && mode === "translate" ? mesh : null;
      rg.attachedMesh = allow && mode === "rotate" ? mesh : null;
      sg.attachedMesh = allow && mode === "scale" ? mesh : null;
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
      sliceModelMatRef.current = createSliceFillMaterial(
        scene,
        new Color3(0.85, 0.86, 0.9),
        "v2_slice_model_mat",
      );
      sliceSupportMatRef.current = createSliceFillMaterial(
        scene,
        new Color3(0.55, 0.7, 0.95),
        "v2_slice_support_mat",
      );

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

        const picked = info.pickInfo?.pickedMesh;

        // 'support' 모드: 모델 표면 픽 → 추가, 기둥 픽 → 선택,
        // 빈 공간 픽 → 선택 해제 (삭제는 Delete 키 / UI 버튼).
        if (editModeRef.current === "support") {
          if (!picked) {
            onPickSupportRef.current(null);
            return;
          }
          const meta = (picked as { metadata?: { type?: string; supportId?: string } })
            .metadata;
          if (meta?.type === "support" && meta.supportId) {
            onPickSupportRef.current(meta.supportId);
            return;
          }
          for (const [id, mesh] of meshMapRef.current) {
            if (mesh === picked && info.pickInfo?.pickedPoint) {
              const p = info.pickInfo.pickedPoint;
              onAddSupportRef.current(id, [p.x, p.y, p.z]);
              onPickSupportRef.current(null);
              return;
            }
          }
          return;
        }

        // 'select' 모드 (기본): 모델 선택 / 빈 공간 = 해제.
        const multi = evt.ctrlKey || evt.metaKey;
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
        // furniture (plate/grid/axes) 픽은 isPickable=false 라 안 옴.
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
        sliceOutlineRef.current?.dispose();
        sliceOutlineRef.current = null;
        for (const fm of sliceFillMeshesRef.current) fm.dispose();
        sliceFillMeshesRef.current = [];
        sliceModelMatRef.current?.dispose();
        sliceSupportMatRef.current?.dispose();
        sliceModelMatRef.current = null;
        sliceSupportMatRef.current = null;
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

    // 3.5) 서포트 점 동기화 — supports / supportParams 변경 시 전부
    //      dispose 후 재생성. 굵기 변화가 즉시 반영되도록 단순화.
    useEffect(() => {
      const scene = sceneRef.current;
      const mat = supportMaterialRef.current;
      if (!scene || !mat) return;

      for (const sm of supportMeshMapRef.current.values()) sm.dispose();
      supportMeshMapRef.current.clear();

      for (const p of supports) {
        const m = createSupportMesh(scene, p, supportParams, mat);
        m.isPickable = editModeRef.current === "support";
        supportMeshMapRef.current.set(p.id, m);
      }
    }, [supports, supportParams]);

    // 4) 선택 변경 시 highlight 갱신
    useEffect(() => {
      refreshHighlight();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIds, selectedSupportId]);

    // 5) Gizmo: 선택 / 모드 / files / editMode 변경 시 attach 재계산
    useEffect(() => {
      syncGizmo();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIds, gizmoMode, files, editMode]);

    // 5.5) Z 슬라이스 미리보기:
    //   · scene.clipPlane 으로 Y > sliceY 영역 컬링.
    //   · 모든 mesh 의 단면 segment 계산 → chain → polygon fill mesh.
    //   · outline 라인은 polygon 경계 위에 얇게 그려 강조.
    useEffect(() => {
      const scene = sceneRef.current;
      const modelMat = sliceModelMatRef.current;
      const supportMat = sliceSupportMatRef.current;
      if (!scene || !modelMat || !supportMat) return;

      // 기존 fill / outline 정리.
      for (const fm of sliceFillMeshesRef.current) fm.dispose();
      sliceFillMeshesRef.current = [];
      sliceOutlineRef.current?.dispose();
      sliceOutlineRef.current = null;

      if (sliceY == null) {
        scene.clipPlane = null;
        return;
      }

      scene.clipPlane = new Plane(0, 1, 0, -sliceY);

      const yFill = sliceY + 0.005;
      const yLine = sliceY + 0.02;
      const lines: Vector3[][] = [];

      // 모델 단면.
      for (const mesh of meshMapRef.current.values()) {
        const segs = sliceMeshAtY(mesh, sliceY);
        if (segs.length === 0) continue;
        const polys = chainSegments(segs);
        for (const p of polys) {
          const fill = buildPolygonFillMesh(
            scene,
            p,
            yFill,
            modelMat,
            "v2_slice_model_fill",
          );
          if (fill) sliceFillMeshesRef.current.push(fill);
        }
        for (const s of segs) {
          lines.push([
            new Vector3(s.a[0], yLine, s.a[1]),
            new Vector3(s.b[0], yLine, s.b[1]),
          ]);
        }
      }

      // 서포트 단면.
      for (const sm of supportMeshMapRef.current.values()) {
        const segs = sliceMeshAtY(sm, sliceY);
        if (segs.length === 0) continue;
        const polys = chainSegments(segs);
        for (const p of polys) {
          const fill = buildPolygonFillMesh(
            scene,
            p,
            yFill,
            supportMat,
            "v2_slice_support_fill",
          );
          if (fill) sliceFillMeshesRef.current.push(fill);
        }
        for (const s of segs) {
          lines.push([
            new Vector3(s.a[0], yLine, s.a[1]),
            new Vector3(s.b[0], yLine, s.b[1]),
          ]);
        }
      }

      if (lines.length > 0) {
        const ol = MeshBuilder.CreateLineSystem(
          "v2_slice_outline",
          { lines },
          scene,
        );
        ol.color = new Color3(1.0, 0.55, 0.15);
        ol.isPickable = false;
        sliceOutlineRef.current = ol;
      }
    }, [sliceY, files, supports, supportParams]);

    // 6) editMode 변경 시:
    //    · STL 메쉬의 PointerDragBehavior detach/attach
    //    · support 메쉬의 isPickable 토글
    useEffect(() => {
      for (const [id, mesh] of meshMapRef.current) {
        const drag = dragBehaviorMapRef.current.get(id);
        if (!drag) continue;
        const attached = mesh.behaviors.includes(drag);
        if (editMode === "support" && attached) {
          mesh.removeBehavior(drag);
        } else if (editMode === "select" && !attached) {
          mesh.addBehavior(drag);
        }
      }
      for (const sm of supportMeshMapRef.current.values()) {
        sm.isPickable = editMode === "support";
      }
    }, [editMode, files, supports]);

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
          if (!scene) return [];
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
        exportStl() {
          const stl = Array.from(meshMapRef.current.values());
          const supports = Array.from(supportMeshMapRef.current.values());
          if (stl.length === 0) return null;
          return meshesToStlBlob([...stl, ...supports]);
        },
        getSliceMask(sliceY, widthPx, heightPx) {
          const polys = [];
          for (const mesh of meshMapRef.current.values()) {
            const segs = sliceMeshAtY(mesh, sliceY);
            polys.push(...chainSegments(segs));
          }
          for (const sm of supportMeshMapRef.current.values()) {
            const segs = sliceMeshAtY(sm, sliceY);
            polys.push(...chainSegments(segs));
          }
          return rasterizePolygons(polys, {
            widthPx,
            heightPx,
            plateWidthMm: PLATE_WIDTH_MM,
            plateDepthMm: PLATE_DEPTH_MM,
          });
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
