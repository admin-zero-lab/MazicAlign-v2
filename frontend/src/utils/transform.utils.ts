import { Vector3, Quaternion } from '@babylonjs/core';

/**
 * Euler 각도를 Quaternion으로 변환
 */
export const eulerToQuaternion = (euler: { x: number; y: number; z: number }): Quaternion => {
  // 각도를 라디안으로 변환
  const pitch = (euler.x * Math.PI) / 180;
  const yaw = (euler.y * Math.PI) / 180;
  const roll = (euler.z * Math.PI) / 180;

  return Quaternion.RotationYawPitchRoll(yaw, pitch, roll);
};

/**
 * Quaternion을 Euler 각도로 변환 (도 단위)
 */
export const quaternionToEuler = (q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): { x: number; y: number; z: number } => {
  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
  const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis rotation)
  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const pitch =
    Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);

  // Yaw (z-axis rotation)
  const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return {
    x: (roll * 180) / Math.PI,
    y: (pitch * 180) / Math.PI,
    z: (yaw * 180) / Math.PI,
  };
};

/**
 * Transform 값 비교 (변경 여부 확인)
 */
export const isTransformEqual = (
  t1: { x: number; y: number; z: number },
  t2: { x: number; y: number; z: number },
  epsilon: number = 0.001
): boolean => {
  return (
    Math.abs(t1.x - t2.x) < epsilon &&
    Math.abs(t1.y - t2.y) < epsilon &&
    Math.abs(t1.z - t2.z) < epsilon
  );
};

/**
 * Delta 값 계산
 */
export const calculateDelta = (
  oldValue: { x: number; y: number; z: number },
  newValue: { x: number; y: number; z: number }
): { x: number; y: number; z: number } => {
  return {
    x: newValue.x - oldValue.x,
    y: newValue.y - oldValue.y,
    z: newValue.z - oldValue.z,
  };
};

/**
 * Transform 값 정규화 (소수점 자리수 제한)
 */
export const normalizeTransform = (
  value: { x: number; y: number; z: number },
  decimals: number = 3
): { x: number; y: number; z: number } => {
  const factor = Math.pow(10, decimals);
  return {
    x: Math.round(value.x * factor) / factor,
    y: Math.round(value.y * factor) / factor,
    z: Math.round(value.z * factor) / factor,
  };
};
