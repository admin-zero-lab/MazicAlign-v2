import {
  useAllProfiles,
  usePrinterProfileStore,
} from "../hooks/usePrinterProfileStore";

interface Props {
  onEdit: () => void;
  className?: string;
}

/**
 * 헤더 dropdown + 편집 버튼. 빌트인 / 사용자 프로파일 같이 노출.
 */
const PrinterProfileSelect: React.FC<Props> = ({ onEdit, className = "" }) => {
  const all = useAllProfiles();
  const currentId = usePrinterProfileStore((s) => s.currentId);
  const setCurrent = usePrinterProfileStore((s) => s.setCurrent);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <select
        value={currentId}
        onChange={(e) => setCurrent(e.target.value)}
        className="px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-700"
        title="프린터 프로파일"
      >
        {all.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.lcdWidthPx}×{p.lcdHeightPx}
          </option>
        ))}
      </select>
      <button
        onClick={onEdit}
        title="프로파일 편집"
        className="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-100"
      >
        ⚙
      </button>
    </div>
  );
};

export default PrinterProfileSelect;
