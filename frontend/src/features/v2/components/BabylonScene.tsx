import { useEffect, useRef } from "react";
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

import { frameCameraToMesh, loadStlIntoScene } from "../utils/stl-loader";

interface BabylonSceneProps {
  /** 현재 로드된 STL Blob. null 이면 빈 씬. */
  stlBlob: Blob | null;
  className?: string;
}

/**
 * v2 의 자기완결 Babylon 씬.
 *
 * 옛 STLViewer / babylon.utils.ts 를 일절 import 하지 않는다.
 * 첫 패스 기능:
 *   - 흰 배경, 회색 그리드 없음(추후), 단일 hemispheric light
 *   - ArcRotate camera (좌클릭 회전, 휠 줌)
 *   - STL Blob 이 바뀌면 기존 메쉬 dispose 후 다시 로드
 *   - 모델 AABB 에 카메라 자동 프레이밍
 */
const BabylonScene: React.FC<BabylonSceneProps> = ({
  stlBlob,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const meshRef = useRef<Mesh | null>(null);

  // 씬 부트스트랩
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.95, 0.96, 0.97, 1);

    const camera = new ArcRotateCamera(
      "cam",
      -Math.PI / 4,
      Math.PI / 3,
      120,
      Vector3.Zero(),
      scene,
    );
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 30;
    camera.minZ = 0.1;

    const light = new HemisphericLight("light", new Vector3(0, 1, 0.3), scene);
    light.intensity = 1.0;
    light.diffuse = new Color3(1, 1, 1);
    light.specular = new Color3(0.1, 0.1, 0.1);

    engineRef.current = engine;
    sceneRef.current = scene;
    cameraRef.current = camera;

    engine.runRenderLoop(() => scene.render());

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      meshRef.current?.dispose();
      meshRef.current = null;
      scene.dispose();
      engine.dispose();
      engineRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  // Blob 변경 시 메쉬 갱신
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    let cancelled = false;

    // 기존 메쉬 정리
    meshRef.current?.dispose();
    meshRef.current = null;

    if (!stlBlob) return;

    (async () => {
      try {
        const mesh = await loadStlIntoScene(scene, stlBlob, "model");
        if (cancelled) {
          mesh.dispose();
          return;
        }
        meshRef.current = mesh;
        frameCameraToMesh(camera, mesh);
      } catch (e) {
        console.error("[v2] STL 로드 실패", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stlBlob]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full outline-none ${className}`}
      style={{ display: "block" }}
    />
  );
};

export default BabylonScene;
