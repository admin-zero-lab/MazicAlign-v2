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
  Mesh,
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

interface BabylonSceneProps {
  /** 프로젝트의 STL 파일 목록. 추가·삭제 시 자동 동기화. */
  files: STLFileV2[];
  /** 오버행 임계각 (deg). */
  overhangAngleDeg: number;
  className?: string;
}

/**
 * v2 의 자기완결 Babylon 씬 (다중 메쉬).
 *
 * files 배열을 watch 해서:
 *   - 새로 들어온 file → STL 로드 + 색 적용
 *   - 사라진 file       → mesh dispose
 * overhangAngleDeg 변경 시 등록된 모든 mesh 의 색만 재할당.
 *
 * 외부 명령: setView, fit
 */
export interface BabylonSceneHandle {
  setView: (preset: ViewPreset) => void;
  fit: () => void;
}

const BabylonScene = forwardRef<BabylonSceneHandle, BabylonSceneProps>(
  function BabylonScene({ files, overhangAngleDeg, className = "" }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const cameraRef = useRef<ArcRotateCamera | null>(null);
    const meshMapRef = useRef<Map<string, Mesh>>(new Map());
    const furnitureRef = useRef<SceneFurniture | null>(null);
    const overhangRef = useRef<number>(overhangAngleDeg);

    overhangRef.current = overhangAngleDeg;

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

      // 사라진 파일: dispose
      for (const id of currentIds) {
        if (!nextIds.has(id)) {
          meshMapRef.current.get(id)?.dispose();
          meshMapRef.current.delete(id);
        }
      }

      // 신규 파일: load
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
            meshMapRef.current.set(f.id, mesh);
            return mesh;
          } catch (e) {
            console.error("[v2] STL 로드 실패", f.fileName, e);
            return null;
          }
        }),
      ).then((loaded) => {
        if (cancelled) return;
        // 메쉬가 비어있었다가 처음 들어왔다면 카메라 fit
        if (wasEmpty && loaded.some((m) => m !== null)) {
          frameCameraToMeshes(
            camera,
            loaded.filter((m): m is Mesh => m !== null),
          );
        }
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

    // 4) 외부 ref API
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
