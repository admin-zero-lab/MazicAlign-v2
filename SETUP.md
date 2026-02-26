# MazicAlign 설정 가이드

## 사전 요구사항

- Node.js 18 이상 — https://nodejs.org/ (LTS 버전 권장)
- npm (Node.js 설치 시 자동 포함)

인터넷 연결 불필요. Firebase 계정 불필요.

---

## 최초 설치

```cmd
install.bat
```

백엔드 + 프론트엔드 `node_modules` 를 설치합니다. 최초 1회만 실행하면 됩니다.

---

## 빌드 (배포 시)

```cmd
build.bat
```

- `frontend/dist/` — 프론트엔드 정적 파일
- `backend/dist/` — 백엔드 컴파일 결과물

---

## 실행

```cmd
start.bat
```

- 포트 5173 단일 서버 시작
- 브라우저 자동 오픈: http://localhost:5173
- DB 자동 생성: `backend/data/mazicalign.db`
- 업로드 경로: `backend/uploads/stl/{projectId}/`

### 개발 모드 (핫 리로드)

```cmd
start-dev.bat
```

백엔드(`npm run dev`)와 프론트엔드 Vite dev server를 각각 실행합니다.

---

## 환경 변수 (선택)

`backend/.env` — 기본값으로도 동작하므로 수정 불필요

```env
PORT=5173
NODE_ENV=production
APP_ID=mazicalign-app
```

---

## 데이터 위치

| 항목 | 경로 |
|------|------|
| SQLite DB | `backend/data/mazicalign.db` |
| STL 파일 | `backend/uploads/stl/{projectId}/` |

서버 재시작 후에도 데이터는 유지됩니다.

---

## 문제 해결

### 빌드 없이 start.bat 실행 시

```
[ERROR] Backend not built. Run build.bat first.
```

→ `build.bat` 먼저 실행

### 포트 5173 이미 사용 중

```cmd
stop.bat
```

→ 실행 후 다시 `start.bat`

### 3D 모델이 표시되지 않음

- STL 파일 형식 확인 (바이너리/ASCII STL 모두 지원)
- 브라우저 콘솔(F12) 에러 메시지 확인

### 서버는 실행되는데 페이지가 안 열림

`build.bat` 을 다시 실행하여 `frontend/dist/index.html` 생성 확인

---

## 개발 구조

- **Frontend** — React 18 + TypeScript + Babylon.js + Tailwind
- **Backend** — Express + TypeScript + SQLite (better-sqlite3)
- **단일 서버 배포** — Express가 `frontend/dist/` 정적 파일 + API 모두 서빙

### Path Alias

```typescript
import STLViewer from '@components/STLViewer';
import { useAuth } from '@hooks/useAuth';
```
