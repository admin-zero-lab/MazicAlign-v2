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
import { applyOverhangColors } from "../utils/overhang";

interface BabylonSceneProps {
  /** 현재 로드된 STL Blob. null 이면 빈 씬. */
  stlBlob: Blob | null;
  /** 오버행 임계각 (deg). 모델이 로드된 상태에서 바뀌면 색만 재할당. */
  overhangAngleDeg: number;
  className?: string;
}

/**
 * v2 의 자기완결 Babylon 씬.
 *
 * 첫 패스 기능:
 *   - ArcRotate camera (좌클릭 회전 · 휠 줌)
 *   - 단일 hemispheric light, 흰 배경
 *   - STL Blob 변경 시 메쉬 dispose 후 재로드
 *   - 모델 AABB 에 카메라 자동 프레이밍
 *   - 오버행 임계각 기반 vertex color 색칠 (빨강 = 오버행)
 */
const BabylonScene: React.FC<BabylonSceneProps> = ({
  stlBlob,
  overhangAngleDeg,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const meshRef = useRef<Mesh | null>(null);

  // 1) 씬 부트스트랩 — 컴포넌트 수명동안 1회
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

  // 2) STL Blob 변경 시 메쉬 갱신
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    let cancelled = false;

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
    // overhangAngleDeg 는 의도적으로 deps 에서 제외: 모델 갱신은
    // Blob 기준으로만 일어나고, 임계각 변경은 아래 effect 가 처리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stlBlob]);

  // 3) 임계각만 바뀌면 색만 재할당 (비싼 STL 재로드 회피)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    applyOverhangColors(mesh, overhangAngleDeg);
  }, [overhangAngleDeg]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full outline-none ${className}`}
      style={{ display: "block" }}
    />
  );
};

export default BabylonScene;
