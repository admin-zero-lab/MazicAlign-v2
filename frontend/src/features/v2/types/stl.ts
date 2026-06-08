/**
 * v2 STL 파일 메타 + Blob.
 *
 * 옛 STLFile 과 무관. 한 프로젝트에 여러 개. Blob 은 IndexedDB 가
 * 그대로 보관 (브라우저가 직렬화한다).
 *
 * 변환(transform) 필드는 Step 6h 에서 추가한다.
 */
export interface STLFileV2 {
  id: string;
  projectId: string;
  fileName: string;
  blob: Blob;
  fileSize: number;
  addedAt: number;
}
