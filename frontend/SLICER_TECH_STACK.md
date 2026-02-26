# Hybrid FDM & DLP Slicer 기술 스택 및 라이브러리 정리

본 문서는 MazicAlign 프로젝트에 구현된 하이브리드(FDM + DLP) 슬라이서의 기술 스택, 사용된 라이브러리, 그리고 핵심 알고리즘을 정리한 것입니다.

## 1. 핵심 기술 스택 (Core Tech Stack)

*   **언어 (Language):** [TypeScript](https://www.typescriptlang.org/) (v5.x)
    *   정적 타입을 통한 안정적인 알고리즘 구현 및 유지보수성 확보.
*   **프레임워크 (Framework):** [React](https://react.dev/) (v18.x)
    *   UI 컴포넌트 구성 및 상태 관리 (SlicerPanel, SlicePreview).
*   **빌드 도구 (Build Tool):** [Vite](https://vitejs.dev/)
    *   빠른 개발 서버 및 Web Worker 번들링 지원 (`?worker` import).

## 2. 3D 그래픽스 및 데이터 처리 (3D Graphics & Data Processing)

*   **3D 엔진:** [Babylon.js](https://www.babylonjs.com/) (Core)
    *   **역할:** STL 파일 로딩, 메쉬 렌더링, 월드 좌표 변환(Matrix, Vector3), 버텍스 데이터 추출.
    *   **활용:** 슬라이싱 전 메쉬의 위치/회전/크기 변환(Transform)을 적용하고, 로컬 좌표를 월드 좌표로 베이킹(Baking)하는 데 사용됨.
*   **데이터 구조:** `Float32Array`
    *   **역할:** 대용량 메쉬 정점(Vertex) 데이터를 효율적으로 처리하기 위해 TypedArray 사용. 메모리 사용량을 최소화하고 연산 속도를 높임.

## 3. 슬라이싱 엔진 (Slicing Engine)

외부 라이브러리(ClipperLib 등) 없이 **자체 구현(Custom Implementation)**된 슬라이싱 엔진을 사용합니다.

*   **위치:** `src/services/slicer/SliceEngine.ts`
*   **알고리즘:**
    *   **Z-Plane Intersection:** 3D 삼각형과 Z축 평면의 교차점을 계산하여 선분(Segment) 생성.
    *   **Robustness (강건성 확보):**
        *   **Z-Perturbation:** 슬라이스 높이에 미세한 값(`epsilon`)을 더해 평면과 삼각형이 완벽히 겹칠 때 발생하는 연산 오류(Coplanar issue) 방지.
        *   **Vertex Quantization:** 교차점을 마이크론 단위로 격자화(Snap)하여 부동소수점 오차로 인한 연결 끊김 방지.
    *   **Graph-Based Connection:** 선분들을 인접 그래프(Adjacency Graph)로 구성하고 순회하여 닫힌 다각형(Closed Loop)을 효율적으로 검출 (O(N) 복잡도).

## 4. 병렬 처리 (Parallel Processing)

*   **Web Workers:** Native Web Worker API
    *   **역할:** 슬라이싱 연산, G-code 생성, 이미지 생성을 메인 스레드와 분리하여 UI 멈춤 현상(Freezing) 방지.
    *   **통신:** 메시지 패싱(Message Passing) 방식으로 메인 스레드와 데이터 교환.

## 5. 모듈별 상세 기술 (Module Details)

### A. DLP 모듈 (Image Generator)
*   **기술:** [OffscreenCanvas API](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
*   **역할:** 슬라이싱된 다각형 레이어를 고해상도 흑백 이미지로 렌더링.
*   **특징:**
    *   Web Worker 내부에서 캔버스 드로잉 수행.
    *   **Fill Rule:** `'evenodd'` 규칙을 사용하여 중첩된 다각형(구멍/Hole)을 정확하게 렌더링.

### B. FDM 모듈 (G-code Generator)
*   **기술:** String Manipulation (Template Literals)
*   **역할:** 다각형 경로를 3D 프린터가 이해할 수 있는 G-code(G1, G0 등)로 변환.
*   **기능:** 외벽(Perimeter) 주행, Z축 이동(Layer Change), 압출량(Extrusion) 계산.

## 6. 요약 (Summary)

| 구분 | 기술/라이브러리 | 비고 |
| :--- | :--- | :--- |
| **Frontend** | React, TypeScript, Tailwind CSS | UI 및 로직 |
| **3D Core** | Babylon.js | 메쉬 로딩 및 변환 |
| **Slicing** | **Custom Algorithm** | 자체 구현 (강건성 확보) |
| **Concurrency** | Web Workers | UI 블로킹 방지 |
| **DLP Rendering** | OffscreenCanvas | 고속 이미지 생성 |
| **FDM Output** | Custom G-code Builder | 문자열 기반 생성 |

이 슬라이서는 외부 의존성을 최소화하고 웹 환경에서의 성능 최적화에 초점을 맞추어 설계되었습니다.
