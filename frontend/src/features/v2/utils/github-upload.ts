/**
 * GitHub Contents API 로 binary blob 을 직접 PUT 한다.
 *
 * 보안 프로그램 (DocuONE 등 DRM) 이 브라우저 다운로드를 잠그는 환경에서
 * 디스크 거치지 않고 메모리의 blob 을 GitHub 저장소에 commit 하는 우회 경로.
 *
 * 기본 대상: admin-zero-lab/MazicAlign (사용자 명시 지정).
 *
 * 필요한 권한:
 *   · Fine-grained PAT — 대상 저장소의 Contents Read/Write
 *   · 또는 Classic PAT — repo scope
 */

export interface GithubUploadOptions {
  owner: string;
  repo: string;
  /** 저장소 안 파일 경로. 예: "samples/foo.stl". */
  path: string;
  /** 업로드할 binary. */
  blob: Blob;
  /** 커밋 메시지. */
  message: string;
  /** PAT (메모리에만 보관, 저장 X). */
  pat: string;
  /** 기본 main. */
  branch?: string;
}

interface GhContentsResponse {
  sha: string;
  content?: {
    sha: string;
    html_url: string;
    download_url: string;
  };
  commit?: { sha: string; html_url: string };
}

/** Blob → base64 (data URL prefix 제거). */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

async function fetchExistingSha(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  pat: string,
): Promise<string | undefined> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(
    path,
  )}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) return undefined;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub GET failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { sha?: string };
  return data.sha;
}

export async function uploadBlobToGithub(
  opts: GithubUploadOptions,
): Promise<GhContentsResponse> {
  const branch = opts.branch ?? "main";
  const base64 = await blobToBase64(opts.blob);

  // 기존 파일 있으면 sha 가져와서 덮어쓰기.
  let sha: string | undefined;
  try {
    sha = await fetchExistingSha(
      opts.owner,
      opts.repo,
      opts.path,
      branch,
      opts.pat,
    );
  } catch {
    // 무시 — PUT 단계에서 다시 시도.
  }

  const url = `https://api.github.com/repos/${opts.owner}/${opts.repo}/contents/${encodeURIComponent(
    opts.path,
  )}`;
  const body: Record<string, unknown> = {
    message: opts.message,
    content: base64,
    branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${opts.pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PUT failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GhContentsResponse;
}
