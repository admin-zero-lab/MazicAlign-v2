# v2

옛 코드와 **완전히 격리된** 새 작업 공간.

## 격리 규칙

이 폴더 안의 어떤 파일도 다음을 import하지 않는다:

- `@components/SupportPanel`
- `@utils/support.utils`
- `../../types/support.types`
- `@hooks/useProjects`, `@hooks/useSTLFiles` 그 외 옛 hook
- `@services/project.service`, `@services/stl.service` 그 외 옛 service
- 그 밖에 옛 서포트·프로젝트·STL 관련 식별자

대신 v2 폴더 내부 모듈만 쓴다.

## 폴더 구조

```
v2/
├─ data/          IndexedDB 스키마 + 리포지토리 (백엔드 의존 없음)
├─ types/         ProjectV2, STLFileV2, SupportParams 등
├─ hooks/         React 훅 (스토어, 데이터 훅)
├─ services/      비즈니스 로직 (리포지토리 위 래퍼)
├─ support/       서포트 알고리즘 · UI (자기완결)
├─ components/    v2 공용 UI (PageShell 등)
└─ pages/         라우트 진입점 (ProjectsV2Page · ViewerV2Page)
```

## 데이터

옛 백엔드(`/api/projects`, `/api/stl`)는 일절 사용하지 않는다. v2 의
모든 데이터는 브라우저 IndexedDB(`resinforge` namespace)에 저장된다.

## 라우트

- `/v2/projects`            — 프로젝트 목록
- `/v2/viewer/:projectId`   — 프로젝트 열기

옛 `/projects`, `/viewer/:id`는 손대지 않는다.

## 표기

화면 라벨에는 "v2", "Support v2" 같은 표기를 쓰지 않는다.
v2 페이지 안에서는 그냥 "Projects", "Support" 다.
