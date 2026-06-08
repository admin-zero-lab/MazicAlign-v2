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
  PointerEventTypes,
  Scene,
  Vector3,
} from "@babylonjs/core";

import { loadStlIntoScene } from "../utils/stl-loader";
import { applyOverhangColors } from "../utils/overhang";
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
  /** 선택된 STL id (좌측 리스트 / 픽 클릭 양방향). null = 선택 없음. */
  selectedId: string | null;
  /** 씬에서 픽으로 선택 변경됐을 때 부모에 알림. 빈 공간 클릭은 null. */
  onSelectId: (id: string | null) => void;
  /** 오버행 임계각 (deg). */
  overhangAngleDeg: number;
  className?: string;
}

export interface BabylonSceneHandle {
  setView: (preset: ViewPreset) => void;
  fit: () => void;
}

const BabylonScene = forwardRef<BabylonSceneHandle, BabylonSceneProps>(
  function BabylonScene(
    { files, selectedId, onSelectId, overhangAngleDeg, className = "" },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const cameraRef = useRef<ArcRotateCamera | null>(null);
    const meshMapRef = useRef<Map<string, Mesh>>(new Map());
    const furnitureRef = useRef<SceneFurniture | null>(null);
    const highlightRef = useRef<HighlightLayer | null>(null);

    // 최신 값을 effect 바깥에서 참조할 수 있게 ref 로 동기화.
    const overhangRef = useRef<number>(overhangAngleDeg);
    overhangRef.current = overhangAngleDeg;
    const selectedRef = useRef<string | null>(selectedId);
    selectedRef.current = selectedId;
    const onSelectRef = useRef(onSelectId);
    onSelectRef.current = onSelectId;

    function refreshHighlight() {
      const hl = highlightRef.current;
      if (!hl) return;
      hl.removeAllMeshes();
      const sel = selectedRef.current;
      if (!sel) return;
      const mesh = meshMapRef.current.get(sel);
      if (mesh) hl.addMesh(mesh, HIGHLIGHT_COLOR);
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
        new Vector3(0, 1, 0.3),
        scene,
      );
      lightTop.intensity = 0.85;
      lightTop.diffuse = new Color3(1, 1, 1);
      lightTop.specular = new Color3(0.1, 0.1, 0.1);

      const lightBottom = new HemisphericLight(
        "lightBottom",
        new Vector3(0, -1, 0),
        scene,
      );
      lightBottom.intensity = 0.25;

      furnitureRef.current = addBuildPlateAndGrid(scene, {
        widthMm: PLATE_WIDTH_MM,
        depthMm: PLATE_DEPTH_MM,
      });

      const hl = new HighlightLayer("v2_highlight", scene, {
        blurHorizontalSize: 0.6,
        blurVerticalSize: 0.6,
      });
      hl.innerGlow = false;
      hl.outerGlow = true;
      highlightRef.current = hl;

      // 클릭 픽업: 좌클릭으로 단순 클릭 (드래그 없는) 시 mesh 픽.
      // 메쉬 위면 선택, 빈 공간이면 선택 해제.
      scene.onPointerObservable.add((info) => {
        if (info.type !== PointerEventTypes.POINTERPICK) return;
        const evt = info.event as PointerEvent;
        if (evt.button !== 0) return; // 좌클릭만

        const picked = info.pickInfo?.pickedMesh;
        if (!picked) {
          onSelectRef.current(null);
          return;
        }
        for (const [id, mesh] of meshMapRef.current) {
          if (mesh === picked) {
            onSelectRef.current(id);
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
            const mesh = await loadStlIntoScene(scene, f.blob, f.fileName);
            if (cancelled) {
              mesh.dispose();
              return null;
            }
            applyOverhangColors(mesh, overhangRef.current);
            mesh.isPickable = true;
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
      });

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

    // 4) 선택 변경 시 highlight 갱신
    useEffect(() => {
      refreshHighlight();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

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
