import { usePrinterProfileStore } from "../hooks/usePrinterProfileStore";

/**
 * 헤더에 두는 프린터 선택 dropdown. 선택 값은 localStorage 에 영속.
 * 슬라이서 해상도 / 빌드 볼륨이 이 선택을 따른다.
 */
const PrinterProfileSelect: React.FC<{ className?: string }> = ({
  className = "",
}) => {
  const profiles = usePrinterProfileStore((s) => s.profiles);
  const currentId = usePrinterProfileStore((s) => s.currentId);
  const setCurrent = usePrinterProfileStore((s) => s.setCurrent);

  return (
    <select
      value={currentId}
      onChange={(e) => setCurrent(e.target.value)}
      className={`px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-700 ${className}`}
      title="프린터 프로파일"
    >
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} · {p.lcdWidthPx}×{p.lcdHeightPx}
        </option>
      ))}
    </select>
  );
};

export default PrinterProfileSelect;
