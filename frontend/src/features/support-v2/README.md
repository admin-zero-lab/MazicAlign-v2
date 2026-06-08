# support-v2

옛 서포트 모듈과 **완전히 격리된** 새 서포트 구현.

## 격리 규칙 (반드시 지킨다)

이 폴더 안에서 다음 경로는 **import 금지**:

- `../../components/SupportPanel`
- `../../utils/support.utils`
- `../../types/support.types`
- 그 밖에 옛 서포트 관련 식별자 (`SupportSettings`, `legacy*` 등)

대신 이 폴더 내부의 `types.ts`, `utils/`, `hooks/`, `components/` 만
사용한다. 옛 모듈의 알고리즘·UI·결정 그 어느 것도 답습하지 않는다.

ViewerPage 등 바깥에서 v2를 쓸 때는 `features/support-v2`의 진입점
(`index.ts`)에서만 가져온다.

## 구조

```
support-v2/
├─ index.ts           public surface
├─ types.ts           v2 전용 타입
├─ utils/             순수 함수 알고리즘 (Babylon 의존 격리)
├─ hooks/             React 훅 (스토어, 핸들러)
└─ components/        UI 컴포넌트
```

## 작업 단계 (예정)

- A. 오버행(overhang) 영역 시각화
- D. 파라미터 패널
- B. 자동 서포트 생성
- C. 수동 서포트 편집

각 단계는 옛 모듈을 보지 않고 백지에서 설계한다.
