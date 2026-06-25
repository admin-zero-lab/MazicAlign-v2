import { useEffect, useState } from "react";

import {
  downloadProjectArchive,
  listProjectArchives,
  uploadProjectArchive,
  type ProjectListItem,
} from "../utils/github-projects";
import {
  exportProjectArchive,
  importProjectArchive,
  previewImportArchive,
} from "../utils/project-archive";

interface Props {
  open: boolean;
  mode: "save" | "load";
  projectId?: string;
  projectName?: string;
  onClose: () => void;
  /** import 성공 후 그 projectId 로 이동. */
  onLoaded?: (projectId: string) => void;
}

const OWNER_REPO = "admin-zero-lab/MazicAlign-v2";

/**
 * GitHub 에 프로젝트 저장 / 불러오기.
 *
 * 저장: 현재 프로젝트의 .mzalign 파일을 projects/<projectId>.mzalign 에 PUT.
 * 불러오기: projects/ 폴더 listing → 선택 → 다운로드 → 충돌 시 사용자
 *   덮어쓰기/새 프로젝트 선택 다이얼로그 → IndexedDB import.
 */
const GithubProjectDialog: React.FC<Props> = ({
  open,
  mode,
  projectId,
  projectName,
  onClose,
  onLoaded,
}) => {
  const [pat, setPat] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    kind: "ok" | "err";
    text: string;
    url?: string;
  } | null>(null);

  // load 모드
  const [list, setList] = useState<ProjectListItem[] | null>(null);
  const [pending, setPending] = useState<{
    blob: Blob;
    fileName: string;
    conflict: boolean;
    projectName: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setList(null);
    setPending(null);
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!projectId) return;
    setBusy(true);
    setResult(null);
    try {
      const blob = await exportProjectArchive(projectId);
      const safe = (projectName ?? "project").replace(/[\\/:*?"<>|]/g, "_");
      const fileName = `${safe}_${projectId.slice(0, 8)}.mzalign`;
      const r = await uploadProjectArchive({
        blob,
        fileName,
        message: `save ${safe}`,
        pat,
      });
      setResult({ kind: "ok", text: "저장 완료", url: r.htmlUrl });
    } catch (e) {
      setResult({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleFetchList = async () => {
    setBusy(true);
    setResult(null);
    try {
      const items = await listProjectArchives({ pat });
      setList(items);
      if (items.length === 0) {
        setResult({ kind: "ok", text: "저장된 프로젝트가 없습니다." });
      }
    } catch (e) {
      setResult({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePickFile = async (item: ProjectListItem) => {
    setBusy(true);
    setResult(null);
    try {
      const blob = await downloadProjectArchive(item.downloadUrl);
      const preview = await previewImportArchive(blob);
      setPending({
        blob,
        fileName: item.fileName,
        conflict: preview.conflict,
        projectName: preview.meta.project.name,
      });
    } catch (e) {
      setResult({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = async (importMode: "overwrite" | "new") => {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await importProjectArchive(pending.blob, importMode);
      setResult({ kind: "ok", text: "불러오기 완료" });
      setPending(null);
      onLoaded?.(r.projectId);
    } catch (e) {
      setResult({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-5 w-[540px] max-w-[95vw] max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          GitHub 프로젝트 {mode === "save" ? "저장" : "불러오기"} —{" "}
          {OWNER_REPO}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          PAT 는 로컬 저장 안 함, 매번 입력.{" "}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer"
            className="text-primary-600 hover:underline"
          >
            Fine-grained PAT 발급
          </a>{" "}
          → 대상 저장소 Contents Read/Write.
        </p>

        <label className="block text-sm mb-3">
          <span className="text-gray-700">PAT</span>
          <input
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="github_pat_..."
            className="mt-1 w-full px-2 py-1 border border-gray-300 rounded font-mono text-xs"
            autoFocus
          />
        </label>

        {mode === "save" && (
          <div className="text-xs text-gray-500 mb-3">
            현재 프로젝트{projectName ? ` "${projectName}"` : ""} 의 STL +
            서포트 + 변환을 .mzalign 으로 압축 후 GitHub 에 저장합니다.
          </div>
        )}

        {mode === "load" && !list && !pending && (
          <button
            onClick={() => void handleFetchList()}
            disabled={busy || !pat}
            className="w-full px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-40 mb-3"
          >
            {busy ? "조회 중..." : "프로젝트 목록 가져오기"}
          </button>
        )}

        {list && !pending && (
          <div className="border border-gray-200 rounded mb-3 max-h-60 overflow-y-auto">
            {list.map((item) => (
              <button
                key={item.fileName}
                onClick={() => void handlePickFile(item)}
                disabled={busy}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 border-b border-gray-100 disabled:opacity-40 font-mono"
              >
                {item.fileName}{" "}
                <span className="text-gray-400 text-xs">
                  ({(item.size / 1024).toFixed(1)} KB)
                </span>
              </button>
            ))}
          </div>
        )}

        {pending && (
          <div className="border border-gray-300 rounded p-3 mb-3 bg-yellow-50">
            <div className="text-sm font-semibold mb-2">
              불러올 프로젝트: {pending.projectName}
            </div>
            {pending.conflict ? (
              <>
                <p className="text-xs text-gray-700 mb-3">
                  같은 id 의 프로젝트가 이미 있습니다. 어떻게 할까요?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleConfirmImport("overwrite")}
                    disabled={busy}
                    className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-40"
                  >
                    덮어쓰기
                  </button>
                  <button
                    onClick={() => void handleConfirmImport("new")}
                    disabled={busy}
                    className="flex-1 px-3 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-40"
                  >
                    새 프로젝트로
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => void handleConfirmImport("new")}
                disabled={busy}
                className="w-full px-3 py-1.5 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-40"
              >
                불러오기
              </button>
            )}
          </div>
        )}

        {result && (
          <div
            className={`mt-3 px-3 py-2 rounded text-xs ${
              result.kind === "ok"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {result.text}
            {result.url && (
              <>
                {" — "}
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  열기
                </a>
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40"
          >
            닫기
          </button>
          {mode === "save" && (
            <button
              onClick={() => void handleSave()}
              disabled={busy || !pat || !projectId}
              className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-40"
            >
              {busy ? "저장 중..." : "저장"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GithubProjectDialog;
