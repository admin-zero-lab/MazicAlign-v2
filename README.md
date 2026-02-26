# MazicAlign

로컬 PC 전용 3D STL 데이터 관리 및 조정 플랫폼

## 프로젝트 개요

교정 전문의 및 기공소가 3D STL 데이터 기반의 교정 프로젝트를 생성/관리하고, STL 파일을 뷰어에서 실시간으로 조정 및 변경 내역을 기록할 수 있는 **로컬 전용** 웹 플랫폼입니다.

인터넷 연결 없이 로컬 PC에서 완전히 동작합니다.

## 기술 스택

### Frontend
- React 18 + TypeScript
- Vite (빌드 툴)
- Babylon.js (3D WebGL 렌더링)
- Tailwind CSS (스타일링)

### Backend
- Node.js + Express
- TypeScript
- SQLite (better-sqlite3) — 로컬 데이터베이스
- Multer — 로컬 파일 저장

## 프로젝트 구조

```
MazicAlign/
├── frontend/                    # React 프론트엔드
│   └── src/
│       ├── components/         # UI 컴포넌트
│       ├── pages/              # 페이지 컴포넌트
│       ├── hooks/              # 커스텀 훅
│       ├── services/           # API 호출
│       ├── utils/              # 유틸리티 함수
│       ├── types/              # TypeScript 타입 정의
│       └── config/             # 설정 파일
├── backend/                     # Node.js 백엔드
│   ├── src/
│   │   ├── controllers/        # 라우트 핸들러
│   │   ├── services/           # 비즈니스 로직
│   │   ├── models/             # 데이터 모델
│   │   ├── routes/             # 라우트 정의
│   │   └── config/             # 설정 파일 (DB 초기화 등)
│   ├── data/                   # SQLite DB (자동 생성)
│   └── uploads/                # 업로드된 STL 파일 (자동 생성)
├── install.bat                  # 최초 1회 의존성 설치
├── build.bat                    # 빌드 (배포 시)
├── start.bat                    # 서버 실행 (배포 시)
└── start-dev.bat                # 개발 모드 실행
```

## 빠른 시작

### 배포판 사용 (ZIP 압축 해제 후)

```
1. install.bat   ← 최초 1회 실행 (node_modules 설치)
2. build.bat     ← 빌드 (frontend/dist, backend/dist 생성)
3. start.bat     ← 서버 실행 → 브라우저 자동 오픈
```

### 개발 모드

```cmd
install.bat       ← 최초 1회
start-dev.bat     ← 개발 서버 실행 (핫 리로드)
```

## 접속 주소

- **배포 모드**: http://localhost:5173 (단일 서버)
- **개발 모드**: http://localhost:5173 (Vite dev server)
- **헬스 체크**: http://localhost:5173/health

## 주요 기능

1. **3D STL 뷰어** — Babylon.js 기반 실시간 3D 모델 뷰어
2. **프로젝트 관리** — 프로젝트 생성/수정/삭제 및 다중 STL 파일 관리
3. **STL 파일 업로드** — 로컬 디스크 저장 (`backend/uploads/stl/`)
4. **변환 조정** — 이동/회전/스케일 실시간 조정
5. **변경 이력 로깅** — STL 조정 내역 자동 기록

## 문제 해결

### 서버가 시작되지 않음

1. `install.bat` → `build.bat` 순서대로 실행했는지 확인
2. `backend/dist/index.js` 파일이 있는지 확인
3. `frontend/dist/index.html` 파일이 있는지 확인

### 포트 5173 충돌

```cmd
stop.bat
```
실행 후 다시 `start.bat`

### Node.js가 없다는 오류

Node.js 설치: https://nodejs.org/ (LTS 버전 권장)
