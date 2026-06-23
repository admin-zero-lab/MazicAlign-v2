import { useEffect, useState } from "react";

import { uploadBlobToGithub } from "../utils/github-upload";

interface Props {
  open: boolean;
  defaultFileName: string;
  /** binary blob 을 만들어 반환하는 함수. dialog 열린 시점 데이터 사용. */
  getBlob: () => Blob | null;
  onClose: () => void;
}

const OWNER = "admin-zero-lab";
const REPO = "MazicAlign";

/**
 * 사용자 PC 보안 프로그램이 디스크 다운로드를 잠그는 환경 우회.
 * binary blob → GitHub Contents API 로 직접 PUT (admin-zero-lab/MazicAlign).
 *
 * PAT 는 컴포넌트 state 에만 보관, localStorage 저장 X.
 */
const GithubUploadDialog: React.FC<Props> = ({
  open,
  defaultFileName,
  getBlob,
  onClose,
}) => {
  const [pat, setPat] = useState("");
  const [folder, setFolder] = useState("samples");
  const [fileName, setFileName] = useState(defaultFileName);
  const [message, setMessage] = useState(`upload ${defaultFileName}`);
  const [branch, setBranch] = useState("main");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    kind: "ok" | "err";
    text: string;
    url?: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setFileName(defaultFileName);
    setMessage(`upload ${defaultFileName}`);
    setResult(null);
  }, [open, defaultFileName]);

  if (!open) return null;

  const path = folder ? `${folder.replace(/\/+$/, "")}/${fileName}` : fileName;

  const handleUpload = async () => {
    setBusy(true);
    setResult(null);
    try {
      const blob = getBlob();
      if (!blob) throw new Error("업로드할 blob 이 없습니다.");
      const r = await uploadBlobToGithub({
        owner: OWNER,
        repo: REPO,
        path,
        blob,
        message,
        branch,
        pat,
      });
      setResult({
        kind: "ok",
        text: "업로드 완료",
        url: r.content?.html_url ?? r.commit?.html_url,
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-5 w-[500px] max-w-[95vw]">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          GitHub 업로드 — {OWNER}/{REPO}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          PAT 는 로컬 저장 안 함. 매 업로드 시 입력.{" "}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer"
            className="text-primary-600 hover:underline"
          >
            Fine-grained PAT 발급
          </a>{" "}
          → 대상 저장소의 Contents Read/Write.
        </p>

        <div className="space-y-3 text-sm">
          <label className="block">
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

          <div className="flex gap-2">
            <label className="flex-1">
              <span className="text-gray-700">폴더</span>
              <input
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
              />
            </label>
            <label className="flex-[2]">
              <span className="text-gray-700">파일명</span>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
              />
            </label>
          </div>

          <div className="text-xs text-gray-500 -mt-2">
            저장 경로 :{" "}
            <span className="font-mono">
              {OWNER}/{REPO}/{branch}/{path}
            </span>
          </div>

          <label className="block">
            <span className="text-gray-700">커밋 메시지</span>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </label>

          <label className="block">
            <span className="text-gray-700">브랜치</span>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
            />
          </label>
        </div>

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
          <button
            onClick={() => void handleUpload()}
            disabled={busy || !pat || !fileName}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "업로드 중..." : "업로드"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GithubUploadDialog;
