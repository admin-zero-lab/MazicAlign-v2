# Bridge tube STL 침투 처리 작업 정리

마지막 업데이트: 2026-06-26
기준 commit: `60fec04` (sphere parent fix). 그 이후 모두 working tree.

## 사용자 요구

A→B 두 점 사이 **직선** Bridge tube 가 STL 표면과 만나는 부분에서:
- **빈틈 0** (cap 가장자리/옆면이 표면 안쪽에 묻혀 매끈한 노출선)
- **반대편 침투 X** (cap 이 모델 두께 뚫고 반대편으로 노출 X)
- **굴곡 표면** 에서도 (평평 X) 동일 — 솟아오른 부분 없이 매끈

중요 — Bridge **중심선은 직선 유지** (휘면 안 됨). 표면 추적/굴곡 따르기는 X.

## 시도 순서: C → B → B+ → A → D (사용자 결정)

### C — 양 끝 PEN 강화 (적용됨)

- 위치: `BabylonScene.tsx` STL pick 분기 (line ~917)
- `PEN = bridge ? radius * 2 + 0.5 : 0.3`
- 반대편 ray cast 로 thickness 측정 → `PEN = min(원하는, thickness - radius - 0.1)`
- **장점**: 비용 0, 굵은 모델에서 cap 가장자리 깊이 박힘
- **한계**:
  - tube **옆면** 이 굴곡 표면 지나가는 부분은 솟아오른 채 (cap PEN 으로 못 잡음)
  - 두께 얇은 모델에선 PEN 자동 clamp → cap 가장자리 빈틈 다시 생김
- 사용자 평가: "C 만으로는 안 됨" → B 진행

### B — 부분 CSG 단순 (다운 발생, 폐기)

- `support-render.ts` 에 CSG 직접 호출. cache 없음.
- STL subset (tube bounding box 안 삼각형만) 추출 후 `CSG.subtract`
- **다운 원인**: STL 회전 시 모든 Bridge 의 contact 좌표 patch chain 으로 변경 → cache miss → 모든 Bridge × CSG 동시 호출 → main thread freeze
- 사용자: "장난해? 웹 다운되잖아" → 즉시 revert

### B+ — setTimeout 디바운스 + cache (적용됨, 사용자 검증 중)

- 처음엔 원본 tube 표시 (CSG 0ms, freeze X)
- supports useEffect 트리거 시 cache miss 인 Bridge id 들을 `pendingCsg` 배열에 모음
- `setTimeout(..., 300)` → 300ms 정지 후 background CSG 일괄 → `swapBridgeMeshGeometry` 로 mesh vertex 만 교체
- cache hit 시 `createSupportMesh` 가 처음부터 깎인 mesh 반환

**key 함수 (`support-render.ts`)**:
- `bridgeCsgCache: Map<supportId, BridgeCacheEntry>` — 모듈 레벨 cache
- `bridgeCacheKey(point, params, stlMeshMap)` — `contact+base+cps+diameter+stlTransform` join
- `tryCachedClippedBridgeMesh(...)` — hit 면 mesh 반환, miss 면 key 만
- `runBridgeCsgIntoCache(...)` — 동기 CSG 호출 + cache 저장 (BabylonScene 의 setTimeout 안에서)
- `swapBridgeMeshGeometry(mesh, data)` — vertex/index/normal 만 교체 (material/parent/metadata 유지)
- `extractStlSubMesh(stl, bbox, margin, scene)` — STL 의 tube bbox 안 삼각형만 mesh

**한계 (미해결)**:
- 사용자가 "멈춤 현상" 보고. revert/복구 반복. 정확한 멈춤 시점/원인 미진단.
- CSG 결과가 빈 mesh 가능성 (Bridge 가 STL 안에 모두 박혀있으면)
- 굵기 슬라이더 dragging 시 매번 cache miss → 디바운스로 완화되지만 슬라이더 놓을 때 freeze 가능

### A — Shader clipping (미구현)

- STL → SDF voxel 그리드 생성 (한 번, 수초 freeze 감수)
- Bridge tube fragment shader 가 SDF lookup → inside fragment `discard`
- 매 frame 0ms, 매끈, 정확
- 구현 복잡 (커스텀 shader, voxel 메모리)
- 다음 진행 예정

### D — Stencil mask (미구현)

- STL 을 stencil buffer 에 그리고 Bridge tube 의 그 밖 픽셀만 그림
- WebGL 1 단계 + 구현 까다로움
- A 가 실패 시 시도

## 현재 working tree 변경 (60fec04 이후)

| 파일 | 변경 |
|---|---|
| `support/utils/defaults.ts` | Bridge max 4 → 10 mm |
| `components/BabylonScene.tsx` | sphere parent / STL pick PEN+ray cast / projectToStlSurface (사용 X) / stlLocalToWorld imperative / B+ deferred CSG import + useEffect |
| `pages/ViewerV2Page.tsx` | stl-local → world reverse useEffect (1.5s 후 자동) / Bridge 생성 시 cp 직선 lerp (표면 추적 시도 폐기됨) |
| `utils/support-render.ts` | CSG cache + helper 함수들 / createSupportMesh cache hit 분기 (Lathe + curve tube 두 곳) |

## 알려진 주의사항

1. **dev 환경 포트 혼동**
   - `localhost:5173` = backend (Express), `frontend/dist` 의 **빌드된** 옛 v1 serve
   - `localhost:5174` = Vite dev server, **최신 소스 hot reload**
   - v2 작업 확인은 항상 5174 로

2. **데이터 store**
   - v2 supports/files 모두 IndexedDB (별도 store). 코드 변경 ≠ 데이터 변경.
   - 화면에 안 보여도 IndexedDB 데이터는 살아있을 가능성 높음 (F12 → Application → IndexedDB 확인)

3. **stl-local 좌표계 이력**
   - commit `0c83dd2` 에서 timing-bad migration 도입 (race 제거 의도) → 새로고침마다 STL transform 한 번 더 곱해져 위치 어긋남
   - working tree 의 reverse useEffect 가 stl-local → world 되돌림 (1 회). 이후 신규 supports 는 world 모드 유지
   - timing-safe stl-local 도입은 별도 commit 예정 (미진행)

## 다음 단계

1. B+ 의 멈춤 정확 진단 → 패치 또는 비활성화
2. A (shader/SDF clipping) 진행
3. 만족 후 commit 단위 분리: (a) Bridge 굵기 max / (b) STL pick ray cast PEN+ thickness / (c) stl-local reverse / (d) sphere parent / (e) B+ CSG
