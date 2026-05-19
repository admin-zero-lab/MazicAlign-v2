import React, { useState } from 'react';
import {
  SupportSettings,
  SupportSubTab,
  SupportThickness,
  SupportMode,
  THICKNESS_PRESETS,
} from '@apptypes/support.types';

interface SupportPanelProps {
  settings: SupportSettings;
  onSettingsChange: (settings: SupportSettings) => void;
  mode: SupportMode;
  onModeChange: (mode: SupportMode) => void;
  supportsVisible: boolean;
  onToggleVisible: () => void;
  supportCount: number;
  /** 빌드플레이트까지 곧장 내리는 서포트 자동 생성 */
  onGeneratePlatform: () => void;
  /** 모든 오버행에 서포트 자동 생성 (모델 하부 착지 포함) */
  onGenerateAll: () => void;
  /** 모든 서포트 삭제 */
  onClearAll: () => void;
  /** 기본값으로 설정 초기화 */
  onResetSettings: () => void;
  /** 모델 존재 여부 */
  hasSelection: boolean;
}

/**
 * 라벨 + 숫자 입력 행
 * 모듈 최상위 컴포넌트로 정의해 부모 리렌더 시 입력 포커스가 풀리지 않게 한다.
 */
const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
}> = ({ label, value, onChange, step = 0.1, min = 0 }) => (
  <div className="flex justify-between items-center py-1">
    <label className="text-sm text-gray-600">{label}</label>
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        onChange(isNaN(v) ? 0 : v);
      }}
      className="w-24 px-2 py-1 text-right text-sm border border-gray-300 rounded focus:outline-none focus:border-primary-500"
    />
  </div>
);

/**
 * 프린트 출력용 서포트 설정 패널
 * ChiTuBox 1.9.5의 서포트 설정 UI 구성을 따른다.
 */
const SupportPanel: React.FC<SupportPanelProps> = ({
  settings,
  onSettingsChange,
  mode,
  onModeChange,
  supportsVisible,
  onToggleVisible,
  supportCount,
  onGeneratePlatform,
  onGenerateAll,
  onClearAll,
  onResetSettings,
  hasSelection,
}) => {
  const [subTab, setSubTab] = useState<SupportSubTab>('top');

  /** 설정값 1개 변경 */
  const set = <K extends keyof SupportSettings>(name: K, value: SupportSettings[K]) => {
    onSettingsChange({ ...settings, [name]: value });
  };

  /** 굵기 프리셋 적용 (직경값 일괄 변경) */
  const applyThickness = (t: SupportThickness) => {
    onSettingsChange({ ...settings, thickness: t, ...THICKNESS_PRESETS[t] });
  };

  const thicknessOptions: { id: SupportThickness; label: string }[] = [
    { id: 'thin', label: '얇게' },
    { id: 'medium', label: '보통' },
    { id: 'thick', label: '굵게' },
  ];

  const subTabs: { id: SupportSubTab; label: string }[] = [
    { id: 'top', label: '상단' },
    { id: 'middle', label: '중앙' },
    { id: 'bottom', label: '바닥' },
    { id: 'raft', label: '라프트' },
  ];

  return (
    <div className="p-4 space-y-4 text-gray-800">
      {/* Z축 이동 높이 */}
      <NumberField
        label="Z축 이동 높이(mm)"
        value={settings.zLiftHeight}
        onChange={(v) => set('zLiftHeight', v)}
        step={0.5}
      />

      {/* 서포트 설정 헤더 */}
      <div className="flex justify-between items-center border-t border-gray-200 pt-3">
        <span className="text-sm font-semibold text-gray-700">서포트 설정</span>
        <button
          onClick={onResetSettings}
          title="기본값으로 초기화"
          className="p-1 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* 굵기 프리셋 */}
      <div className="grid grid-cols-3 gap-2">
        {thicknessOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => applyThickness(opt.id)}
            className={`py-1.5 text-sm rounded border transition-colors ${
              settings.thickness === opt.id
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 서포트 형상 미리보기 */}
      <div className="flex justify-center bg-gray-100 rounded py-3">
        <svg width="70" height="90" viewBox="0 0 70 90">
          {/* 접점 */}
          <circle cx="35" cy="12" r="6" fill="#2f8c6a" />
          {/* 연결부(테이퍼) */}
          <polygon points="29,14 41,14 38,40 32,40" fill="#3aa07c" />
          {/* 기둥 */}
          <rect x="32" y="40" width="6" height="38" fill="#3aa07c" />
          {/* 바닥 */}
          <rect x="22" y="78" width="26" height="6" rx="2" fill="#2f8c6a" />
        </svg>
      </div>

      {/* 하위 탭 */}
      <div className="grid grid-cols-4 gap-1">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`py-1 text-xs rounded transition-colors ${
              subTab === t.id
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 하위 탭 내용 */}
      <div className="space-y-1 border border-gray-200 rounded p-2">
        {subTab === 'top' && (
          <>
            <div className="flex justify-between items-center py-1">
              <label className="text-sm text-gray-600">접점 형태</label>
              <select
                value={settings.contactShape}
                onChange={(e) => set('contactShape', e.target.value as SupportSettings['contactShape'])}
                className="w-24 px-1 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-primary-500"
              >
                <option value="sphere">구</option>
                <option value="cone">원뿔</option>
              </select>
            </div>
            <NumberField label="접점 직경(mm)" value={settings.contactDiameter} onChange={(v) => set('contactDiameter', v)} step={0.05} />
            <NumberField label="접점 깊이(mm)" value={settings.contactDepth} onChange={(v) => set('contactDepth', v)} step={0.05} />
            <div className="flex justify-between items-center py-1">
              <label className="text-sm text-gray-600">연결 형태</label>
              <select
                value={settings.connectionShape}
                onChange={(e) => set('connectionShape', e.target.value as SupportSettings['connectionShape'])}
                className="w-24 px-1 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-primary-500"
              >
                <option value="cone">원뿔형</option>
                <option value="cylinder">원기둥형</option>
              </select>
            </div>
            <NumberField label="상단 직경(mm)" value={settings.topDiameter} onChange={(v) => set('topDiameter', v)} step={0.05} />
            <NumberField label="하단 직경(mm)" value={settings.bottomDiameter} onChange={(v) => set('bottomDiameter', v)} step={0.05} />
            <NumberField label="연결 길이(mm)" value={settings.connectionLength} onChange={(v) => set('connectionLength', v)} step={0.5} />
          </>
        )}
        {subTab === 'middle' && (
          <>
            <NumberField label="기둥 직경(mm)" value={settings.middleDiameter} onChange={(v) => set('middleDiameter', v)} step={0.05} />
            <p className="text-xs text-gray-400 pt-1">서포트 기둥(중앙부)의 굵기입니다.</p>
          </>
        )}
        {subTab === 'bottom' && (
          <>
            <NumberField label="바닥 직경(mm)" value={settings.baseDiameter} onChange={(v) => set('baseDiameter', v)} step={0.5} />
            <NumberField label="바닥 두께(mm)" value={settings.baseThickness} onChange={(v) => set('baseThickness', v)} step={0.1} />
            <p className="text-xs text-gray-400 pt-1">빌드플레이트에 닿는 서포트 바닥 부착부입니다.</p>
          </>
        )}
        {subTab === 'raft' && (
          <>
            <div className="flex justify-between items-center py-1">
              <label className="text-sm text-gray-600">라프트 사용</label>
              <input
                type="checkbox"
                checked={settings.raftEnabled}
                onChange={(e) => set('raftEnabled', e.target.checked)}
                className="h-4 w-4"
              />
            </div>
            <NumberField label="라프트 두께(mm)" value={settings.raftThickness} onChange={(v) => set('raftThickness', v)} step={0.1} />
            <NumberField label="라프트 여백(mm)" value={settings.raftMargin} onChange={(v) => set('raftMargin', v)} step={0.5} />
          </>
        )}
      </div>

      {/* 자동/수동 지원 */}
      <div className="border-t border-gray-200 pt-3">
        <span className="text-sm font-semibold text-gray-700">자동/수동 지원</span>
      </div>
      <div className="space-y-1">
        <NumberField label="크로스 너비(mm)" value={settings.crossWidth} onChange={(v) => set('crossWidth', v)} step={0.5} />
        <NumberField label="격자서포트 시작 높이(mm)" value={settings.gridStartHeight} onChange={(v) => set('gridStartHeight', v)} step={0.5} />
        <NumberField label="밀도(%)" value={settings.density} onChange={(v) => set('density', v)} step={5} min={1} />
        <NumberField label="각도(°)" value={settings.overhangAngle} onChange={(v) => set('overhangAngle', v)} step={5} min={1} />
      </div>

      {/* 자동 생성 버튼 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onGeneratePlatform}
          disabled={!hasSelection}
          title={hasSelection ? '' : '모델을 먼저 불러오세요'}
          className="py-2 text-sm rounded bg-gray-600 text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + 플랫폼
        </button>
        <button
          onClick={onGenerateAll}
          disabled={!hasSelection}
          title={hasSelection ? '' : '모델을 먼저 불러오세요'}
          className="py-2 text-sm rounded bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + 전체
        </button>
      </div>

      {/* 모드 / 표시 토글 */}
      <div className="flex justify-around items-center bg-gray-100 rounded py-2">
        <button
          onClick={onToggleVisible}
          title={supportsVisible ? '서포트 숨기기' : '서포트 표시'}
          className={`p-2 rounded ${supportsVisible ? 'text-primary-600' : 'text-gray-400'} hover:bg-gray-200`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
        <button
          onClick={() => onModeChange(mode === 'add' ? 'off' : 'add')}
          title="서포트 추가 — 모델을 클릭해 서포트를 직접 추가"
          className={`p-2 rounded ${mode === 'add' ? 'bg-primary-600 text-white' : 'text-gray-600'} hover:bg-gray-200`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={() => onModeChange(mode === 'delete' ? 'off' : 'delete')}
          title="서포트 삭제 — 서포트를 클릭해 개별 삭제"
          className={`p-2 rounded ${mode === 'delete' ? 'bg-red-600 text-white' : 'text-gray-600'} hover:bg-gray-200`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={() => onModeChange('off')}
          title="편집 모드 끄기"
          className={`p-2 rounded ${mode === 'off' ? 'bg-gray-300 text-gray-700' : 'text-gray-600'} hover:bg-gray-200`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
      </div>

      {/* 모드 안내 */}
      {mode !== 'off' && (
        <div className="text-xs text-center text-primary-600">
          {mode === 'add' ? '모델 표면을 클릭하면 서포트가 추가됩니다.' : '서포트를 클릭하면 삭제됩니다.'}
        </div>
      )}

      {/* 서포트 개수 + 모두 지우기 */}
      <div className="border-t border-gray-200 pt-3 space-y-2">
        <div className="text-xs text-gray-500 text-center">현재 서포트: {supportCount}개</div>
        <button
          onClick={onClearAll}
          disabled={supportCount === 0}
          className="w-full py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          모두 지우기
        </button>
      </div>
    </div>
  );
};

export default SupportPanel;
