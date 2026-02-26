# MazicAlign v2 — 기획 및 설계 문서

> 로컬 PC 전용 3D STL 뷰어 · 슬라이서 플랫폼
> 인터넷 불필요 · ZIP 배포 · `start.bat` 한 번으로 실행

---

## 1. 제품 개요

| 항목 | 내용 |
|------|------|
| 제품명 | MazicAlign v2 |
| 배포 형태 | ZIP 압축 → 압축 해제 → `install.bat` → `start.bat` |
| 실행 환경 | Windows 10/11 + Node.js 22 LTS (동봉 가능) |
| 접속 방법 | 브라우저 `http://localhost:5173` 자동 오픈 |
| 인증 | 없음 (로컬 단일 사용자) |
| 데이터 저장 | SQLite 단일 파일 (`data/mazicalign.db`) |
| 파일 저장 | 로컬 디스크 (`uploads/stl/{projectId}/`) |

---

## 2. 핵심 기능

### 2-1. 프로젝트 관리
- 프로젝트 생성 / 목록 / 삭제
- 프로젝트 코드, 환자 정보 메타데이터

### 2-2. STL 파일 관리
- 로컬 PC 파일 탐색기로 STL 파일 열기 (복수 선택)
- 파일 목록 (이름, 크기, 가시성 토글, 삭제)
- 각 파일 독립 Transform (위치 / 회전 / 크기)

### 2-3. 3D 뷰어
- WebGL 기반 실시간 렌더링
- 마우스 Orbit / Pan / Zoom
- 그리드 바닥면, 축 표시 (X/Y/Z)
- 파일별 색상 구분, 투명도 조절
- 선택된 모델 하이라이트
- Gizmo 드래그로 직관적 Transform 조작

### 2-4. STL 컨트롤 (Transform)
- Translation (X / Y / Z) — 수치 입력 또는 Gizmo 드래그
- Rotation (X / Y / Z, Euler 도 단위) — 수치 입력 또는 Gizmo 드래그
- Scale (Uniform / X / Y / Z) — 수치 입력
- Transform 초기화 (Reset to Origin)
- 변경 이력 (History) — 단계별 되돌리기 목록

### 2-5. FDM 슬라이서
- 레이어 두께 설정 (0.05 ~ 0.5 mm)
- 인필 밀도 / 패턴 선택
- 서포트 생성 on/off
- 노즐 직경 설정
- 레이어별 G-code 미리보기 (2D 상면도)
- G-code 파일 내보내기 (`.gcode`)

### 2-6. DLP 슬라이서
- 레이어 두께 설정 (0.01 ~ 0.1 mm)
- 빌드 플레이트 크기 설정 (X × Y mm)
- 픽셀 해상도 설정 (px/mm)
- 레이어별 마스크 이미지 미리보기 (PNG 흑백)
- 출력물 이미지 시퀀스 내보내기 (ZIP → PNG 폴더)
- CTB / Photon 포맷 내보내기 (선택 사항)

---

## 3. 기술 스택

### 3-1. Frontend

| 분류 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | **React 18** | 컴포넌트 기반, 생태계 풍부 |
| 언어 | **TypeScript 5** | 타입 안전성 |
| 빌드 | **Vite 5** | 빠른 HMR, ESM 네이티브 |
| 스타일 | **Tailwind CSS 3** | 유틸리티 퍼스트, 빠른 UI 구성 |
| 상태 관리 | **Zustand 4** | 경량, 보일러플레이트 없음 |
| 라우팅 | **React Router 6** | SPA 라우팅 |
| 3D 엔진 | **Three.js r168** | WebGL 표준, 넓은 생태계 |
| 3D 헬퍼 | **@react-three/fiber** | React + Three.js 통합 |
| 3D 컨트롤 | **@react-three/drei** | OrbitControls, Gizmo 등 |
| STL 파서 | **Three.js STLLoader** (내장) | ASCII / Binary STL 지원 |
| 슬라이서 | **Web Worker** (커스텀) | 메인 스레드 블로킹 방지 |
| 아이콘 | **Lucide React** | 경량, 트리쉐이킹 |

> **Three.js + react-three/fiber 선택 이유**
> 현재 BabylonJS 대비 번들 사이즈 절반, React 생태계 통합 자연스러움,
> `@react-three/drei`의 `<TransformControls>` Gizmo가 즉시 사용 가능.

### 3-2. Backend

| 분류 | 선택 | 이유 |
|------|------|------|
| 런타임 | **Node.js 22 LTS** | 안정성, 로컬 파일 시스템 접근 |
| 언어 | **TypeScript 5** | 타입 안전성 |
| 프레임워크 | **Express 5** | 경량, 미들웨어 생태계 |
| 빌드 | **tsc + tsc-alias** | path alias 런타임 해결 |
| DB | **better-sqlite3 v11** | 동기 API, 단일 파일, 빠름 |
| ID 생성 | **uuid v9** | 표준 UUID v4 |
| 파일 업로드 | **multer** | multipart form-data |
| 프로세스 관리 | **Node.js 내장** | 별도 PM2 불필요 (로컬) |

### 3-3. 슬라이서 엔진 (브라우저 내부)

| 분류 | 선택 |
|------|------|
| 실행 방식 | Web Worker (별도 스레드) |
| 3D 교차 계산 | 커스텀 Ray-casting + AABB |
| 다각형 클리핑 | **Clipper2-js** (Angus Johnson 알고리즘) |
| FDM 경로 생성 | 커스텀 (Contour + Zigzag Infill) |
| DLP 래스터화 | `OffscreenCanvas` + `Path2D` |
| G-code 출력 | 문자열 템플릿 생성 |
| PNG 내보내기 | `canvas.toBlob()` → JSZip |

---

## 4. 시스템 아키텍처

```
[브라우저 http://localhost:5173]
 ├─ React SPA
 │   ├─ 3D Viewer  (@react-three/fiber + drei)
 │   ├─ Transform Panel (수치 입력)
 │   ├─ File Browser (로컬 경로 탐색)
 │   ├─ FDM Slicer Panel → Web Worker → Layer Preview
 │   └─ DLP Slicer Panel → Web Worker → PNG Preview
 │
 └─ HTTP API (/api/*)
      │
[Express 서버 :5173]
 ├─ GET  /              → frontend/dist/index.html
 ├─ GET  /api/health    → 상태 확인
 ├─ GET  /api/fs        → 로컬 파일 시스템 탐색
 ├─ CRUD /api/projects  → 프로젝트 관리
 ├─ CRUD /api/stl       → STL 파일 관리 (메타데이터)
 ├─ POST /api/stl/import-path  → 로컬 경로에서 파일 복사
 └─ GET  /uploads/**    → 저장된 STL 파일 서빙
      │
[SQLite DB]  data/mazicalign.db
[STL 파일]   uploads/stl/{projectId}/{filename}
```

---

## 5. DB 스키마

```sql
-- 프로젝트
CREATE TABLE projects (
  projectId     TEXT PRIMARY KEY,
  projectCode   TEXT NOT NULL,
  projectName   TEXT NOT NULL,
  patientInfo   TEXT,              -- JSON {"name","age","memo"}
  createdAt     TEXT NOT NULL,
  lastModified  TEXT NOT NULL
);

-- STL 파일
CREATE TABLE stl_files (
  stlId            TEXT PRIMARY KEY,
  projectId        TEXT NOT NULL REFERENCES projects(projectId),
  originalUrl      TEXT NOT NULL,   -- /uploads/stl/{projectId}/{filename}
  fileName         TEXT NOT NULL,
  fileSize         INTEGER,
  visibility       INTEGER DEFAULT 1,
  currentTransform TEXT NOT NULL,   -- JSON Transform 객체
  uploadedAt       TEXT NOT NULL
);

-- 조정 이력
CREATE TABLE adjustment_logs (
  logId          TEXT PRIMARY KEY,
  projectId      TEXT NOT NULL,
  stlId          TEXT NOT NULL,
  adjustmentType TEXT NOT NULL,   -- TRANSLATION | ROTATION | SCALE
  deltaValue     TEXT NOT NULL,   -- JSON
  timestamp      TEXT NOT NULL
);
```

---

## 6. API 명세

### 6-1. 파일 시스템 탐색

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/fs` | 루트(드라이브 목록) 또는 `?path=` 경로 탐색 |

**Response**
```json
{
  "success": true,
  "currentPath": "D:\\Models",
  "parentPath": "D:\\",
  "items": [
    { "name": "tooth.stl", "fullPath": "D:\\Models\\tooth.stl", "isDirectory": false, "size": 204800 },
    { "name": "SubFolder",  "fullPath": "D:\\Models\\SubFolder",  "isDirectory": true,  "size": null }
  ]
}
```

### 6-2. 프로젝트 CRUD

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/projects` | 전체 프로젝트 목록 |
| POST | `/api/projects` | 프로젝트 생성 |
| GET | `/api/projects/:id` | 단건 조회 |
| PUT | `/api/projects/:id` | 수정 |
| DELETE | `/api/projects/:id` | 삭제 |

### 6-3. STL 파일 CRUD

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stl?projectId=` | 프로젝트 STL 목록 |
| POST | `/api/stl/import-path` | 로컬 경로에서 복사 등록 |
| POST | `/api/stl/upload` | multipart 업로드 |
| PUT | `/api/stl/:id/visibility` | 가시성 토글 |
| PUT | `/api/stl/:id/transform` | Transform 저장 |
| DELETE | `/api/stl/:id` | 파일 삭제 |

### 6-4. 이력 관리

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stl/:id/logs` | 조정 이력 조회 |
| POST | `/api/stl/:id/logs` | 이력 추가 |
| DELETE | `/api/stl/:id/logs` | 전체 이력 삭제 |
| DELETE | `/api/stl/logs/:logId` | 단건 삭제 |

---

## 7. 프론트엔드 컴포넌트 구조

```
src/
├── pages/
│   ├── ProjectListPage.tsx     # 프로젝트 목록
│   └── ViewerPage.tsx          # 메인 뷰어
│
├── components/
│   ├── viewer/
│   │   ├── Canvas3D.tsx        # @react-three/fiber Canvas 루트
│   │   ├── STLMesh.tsx         # 개별 STL 메시 (로드 + 렌더)
│   │   ├── GizmoControls.tsx   # TransformControls Gizmo
│   │   ├── CameraControls.tsx  # OrbitControls
│   │   └── SceneHelpers.tsx    # Grid, Axes, Lighting
│   │
│   ├── panel/
│   │   ├── FileListPanel.tsx   # 좌측 파일 목록
│   │   ├── TransformPanel.tsx  # 우측 수치 입력 패널
│   │   └── HistoryPanel.tsx    # 우측 이력 패널
│   │
│   ├── slicer/
│   │   ├── FDMSlicerPanel.tsx  # FDM 설정 UI
│   │   ├── DLPSlicerPanel.tsx  # DLP 설정 UI
│   │   ├── LayerPreview2D.tsx  # FDM 레이어 2D 뷰
│   │   └── DLPLayerPreview.tsx # DLP 마스크 이미지 뷰
│   │
│   └── common/
│       ├── LocalFileBrowser.tsx
│       ├── Modal.tsx
│       └── Toolbar.tsx
│
├── workers/
│   ├── fdm.worker.ts           # FDM 슬라이싱 Web Worker
│   └── dlp.worker.ts           # DLP 슬라이싱 Web Worker
│
├── stores/
│   ├── projectStore.ts         # Zustand: 프로젝트 상태
│   ├── stlStore.ts             # Zustand: STL 파일 상태
│   └── viewerStore.ts          # Zustand: 뷰어 설정 (투명도 등)
│
├── services/
│   ├── project.service.ts
│   ├── stl.service.ts
│   └── slicer/
│       ├── FDMSlicer.ts        # Worker 통신 래퍼
│       └── DLPSlicer.ts        # Worker 통신 래퍼
│
└── types/
    ├── project.types.ts
    ├── stl.types.ts
    └── slicer.types.ts
```

---

## 8. 슬라이서 알고리즘 설계

### 8-1. 공통 — 레이어 단면 추출

```
입력: STL 삼각형 메시 (Float32Array, 9 floats per triangle)
      레이어 두께 h, 빌드 높이 Z_max

for each z = h, 2h, 3h, ... Z_max:
  for each triangle:
    교차 판정 (z 평면과 삼각형 교선 계산)
    교선 선분 수집
  선분 → 다각형 연결 (Contour 조립)
  → LayerData { z, contours: Polygon[] }
```

### 8-2. FDM 추가 단계

```
LayerData →
  1. Perimeter 경로 생성 (외곽선 offset -nozzle/2)
  2. Infill 경로 생성 (Zigzag / Grid / Honeycomb)
  3. Support 경로 생성 (선택)
  4. G-code 라인 생성:
     G0 (이동) / G1 F{speed} E{extrusion} (압출)
```

**G-code 템플릿 (헤더)**
```gcode
M104 S{temp}    ; 노즐 온도
M140 S{bed}     ; 베드 온도
G28             ; 홈
G29             ; 오토레벨
G92 E0
```

### 8-3. DLP 추가 단계

```
LayerData →
  OffscreenCanvas(width_px, height_px) 생성
  ctx.fillStyle = 'white'
  contours → Path2D → ctx.fill()
  canvas.toBlob('image/png') → Uint8Array
  → { z, imageData: Uint8Array }

최종 내보내기:
  JSZip → layers/0001.png, 0002.png, ...
  → exposure.json (레이어 개수, 노출 시간, 두께)
  → download as .zip
```

---

## 9. Transform 데이터 모델

```typescript
interface Transform {
  translation: { x: number; y: number; z: number };   // mm
  rotation:    { x: number; y: number; z: number; w: number }; // Quaternion
  scale:       { x: number; y: number; z: number };   // 배율 (1.0 = 원본)
}

// DB 저장: JSON.stringify(transform)
// Three.js 적용:
//   mesh.position.set(t.translation.x, t.translation.y, t.translation.z)
//   mesh.setRotationFromQuaternion(new Quaternion(r.x, r.y, r.z, r.w))
//   mesh.scale.set(s.x, s.y, s.z)
```

---

## 10. 배포 패키지 구조

```
mazicalign-v2/
├── backend/
│   ├── dist/               ← 빌드 결과물 (JS)
│   ├── node_modules/       ← npm install 후 생성
│   ├── data/               ← SQLite DB (자동 생성)
│   ├── uploads/            ← STL 파일 저장
│   └── package.json
│
├── frontend/
│   └── dist/               ← Vite 빌드 결과물 (Express가 서빙)
│
├── install.bat             ← 최초 1회: npm install
├── build.bat               ← 재빌드: frontend + backend
├── start.bat               ← 매번 실행: node dist/index.js
└── stop.bat                ← 서버 종료: kill port 5173
```

---

## 11. 개발 우선순위

| 순서 | 기능 | 난이도 | 비고 |
|------|------|--------|------|
| 1 | 프로젝트 CRUD + DB 연동 | 하 | 현재 코드 재사용 가능 |
| 2 | STL 로드 + Three.js 뷰어 | 중 | STLLoader 기본 |
| 3 | OrbitControls (줌인/아웃/회전) | 하 | drei 기본 제공 |
| 4 | Transform 수치 입력 패널 | 중 | 현재 코드 재사용 |
| 5 | Gizmo 드래그 컨트롤 | 중 | drei TransformControls |
| 6 | 로컬 파일 탐색기 | 하 | 현재 코드 재사용 |
| 7 | FDM 슬라이서 | 상 | Worker + 알고리즘 |
| 8 | DLP 슬라이서 | 상 | OffscreenCanvas + ZIP |
| 9 | G-code 내보내기 | 중 | 문자열 생성 |
| 10 | DLP PNG ZIP 내보내기 | 중 | JSZip |

---

## 12. 주요 npm 패키지 목록

### Frontend
```json
{
  "dependencies": {
    "react": "^18.3",
    "react-dom": "^18.3",
    "react-router-dom": "^6.22",
    "three": "^0.168",
    "@react-three/fiber": "^8.16",
    "@react-three/drei": "^9.105",
    "zustand": "^4.5",
    "lucide-react": "^0.400",
    "jszip": "^3.10",
    "clipper2-js": "^0.0.10"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "vite": "^5.2",
    "@vitejs/plugin-react": "^4.2",
    "tailwindcss": "^3.4",
    "autoprefixer": "^10.4",
    "@types/three": "^0.168"
  }
}
```

### Backend
```json
{
  "dependencies": {
    "express": "^5.0",
    "better-sqlite3": "^11.0",
    "multer": "^1.4",
    "cors": "^2.8",
    "uuid": "^9.0"
  },
  "devDependencies": {
    "typescript": "^5.4",
    "tsc-alias": "^1.8",
    "@types/express": "^5.0",
    "@types/better-sqlite3": "^7.6",
    "@types/multer": "^1.4",
    "@types/cors": "^2.8",
    "@types/uuid": "^9.0"
  }
}
```

---

*문서 버전: 2026-02-26*
