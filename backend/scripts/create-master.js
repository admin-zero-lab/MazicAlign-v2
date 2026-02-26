// 로컬 전용 시스템에서는 사용자 계정이 필요 없습니다.
// 앱 시작 시 자동으로 'Local User' (MASTER 권한)로 로그인됩니다.
//
// 데이터베이스 초기화 확인:
//   node -e "import('./create-master.js')"
//
// 또는 start.bat으로 서버를 시작하면 DB가 자동 생성됩니다.

console.log('이 스크립트는 더 이상 필요하지 않습니다.');
console.log('로컬 전용 시스템: start.bat 실행 후 http://localhost:5173 접속');
