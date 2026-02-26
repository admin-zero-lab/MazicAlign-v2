# Scripts

로컬 전용 시스템으로 마이그레이션된 이후 이 디렉토리의 스크립트는 사용하지 않습니다.

## STL 파일 업로드

Firebase Storage 대신 UI를 통해 직접 업로드합니다.

1. `start.bat` 실행
2. 브라우저에서 `http://localhost:5173` 접속
3. 프로젝트 열기 → STL 파일 업로드 버튼 사용

업로드된 파일은 `backend/uploads/stl/{projectId}/` 에 저장됩니다.

## 데이터베이스

SQLite DB는 서버 최초 실행 시 `backend/data/mazicalign.db` 에 자동 생성됩니다.
