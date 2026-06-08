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
  frameCameraToMesh,
  resetCameraOnPlate,
  type ViewPreset,
} from "../utils/camera-views";

const PLATE_WIDTH_MM = 200;
const PLATE_DEPTH_MM = 125;

interface BabylonSceneProps {
  /** 현재 로드된 STL Blob. null 이면 빈 씬. */
  stlBlob: Blob | null;
  /** 오버행 임계각 (deg). */
  overhangAngleDeg: number;
  className?: string;
}

/**
 * v2 의 자기완결 Babylon 씬.
 *
 * 외부에서 사용할 수 있는 명령:
 *   - setView('home'|'top'|'front'|'back'|'left'|'right'|'iso')
 *   - fit()                — 현재 메쉬 또는 빌드플레이트에 카메라 맞춤
 */
export interface BabylonSceneHandle {
  setView: (preset: ViewPreset) => void;
  fit: () => void;
}

const BabylonScene = forwardRef<BabylonSceneHandle, BabylonSceneProps>(
  function BabylonScene({ stlBlob, overhangAngleDeg, className = "" }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const cameraRef = useRef<ArcRotateCamera | null>(null);
    const meshRef = useRef<Mesh | null>(null);
    const furnitureRef = useRef<SceneFurniture | null>(null);

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
      // 좌클릭=회전, 우클릭=패닝 (표준)
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

      // 빌드플레이트 + 그리드 + 좌표축
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
        meshRef.current?.dispose();
        meshRef.current = null;
        furnitureRef.current?.dispose();
        furnitureRef.current = null;
        scene.dispose();
        engine.dispose();
        engineRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
      };
    }, []);

    // 2) STL Blob 변경
    useEffect(() => {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!scene || !camera) return;

      let cancelled = false;

      meshRef.current?.dispose();
      meshRef.current = null;

      if (!stlBlob) {
        resetCameraOnPlate(camera, PLATE_WIDTH_MM, PLATE_DEPTH_MM);
        return;
      }

      (async () => {
        try {
          const mesh = await loadStlIntoScene(scene, stlBlob, "model");
          if (cancelled) {
            mesh.dispose();
            return;
          }
          applyOverhangColors(mesh, overhangAngleDeg);
          meshRef.current = mesh;
          frameCameraToMesh(camera, mesh);
        } catch (e) {
          console.error("[v2] STL 로드 실패", e);
        }
      })();

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stlBlob]);

    // 3) 임계각만 변경
    useEffect(() => {
      const mesh = meshRef.current;
      if (!mesh) return;
      applyOverhangColors(mesh, overhangAngleDeg);
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
          if (meshRef.current) {
            frameCameraToMesh(camera, meshRef.current);
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
