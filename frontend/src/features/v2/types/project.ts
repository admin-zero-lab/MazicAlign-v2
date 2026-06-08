/**
 * v2 프로젝트 데이터 모델.
 *
 * 옛 Project (백엔드 DB row) 와 무관하게 다시 정의한다. 모든 시간은
 * epoch ms. id 는 클라이언트에서 crypto.randomUUID 로 발급.
 */
export interface ProjectV2 {
  id: string;
  name: string;
  /** 사용자가 식별하기 위한 짧은 코드 (영문 대문자 + 숫자, 8자리). */
  code: string;
  createdAt: number;
  lastModifiedAt: number;
  /** 환자 메모 등 자유 텍스트. 선택. */
  note?: string;
}

/** 새 프로젝트 생성 시 호출 측이 채워야 하는 필드. */
export type ProjectV2CreateInput = Pick<ProjectV2, "name"> &
  Partial<Pick<ProjectV2, "note">>;
