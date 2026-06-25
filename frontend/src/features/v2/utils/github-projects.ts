/**
 * GitHub Contents API 로 프로젝트 .mzalign 파일 저장 / 불러오기.
 *
 * 대상: admin-zero-lab/MazicAlign-v2 의 projects/ 폴더.
 * PAT 매번 입력, localStorage 저장 X.
 */

const OWNER = "admin-zero-lab";
const REPO = "MazicAlign-v2";
const FOLDER = "projects";

const GH_BASE = "https://api.github.com";

function headers(pat: string): Record<string, string> {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

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
  path: string,
  branch: string,
  pat: string,
): Promise<string | undefined> {
  const url = `${GH_BASE}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(
    path,
  )}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers(pat) });
  if (res.status === 404) return undefined;
  if (!res.ok) {
    throw new Error(`GitHub GET sha 실패: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { sha?: string };
  return data.sha;
}

/**
 * .mzalign blob 을 projects/<fileName> 경로에 PUT. 같은 path 의 옛
 * 파일 있으면 sha 자동 가져와 덮어쓰기.
 */
export async function uploadProjectArchive(opts: {
  blob: Blob;
  fileName: string;
  message: string;
  pat: string;
  branch?: string;
}): Promise<{ htmlUrl?: string }> {
  const branch = opts.branch ?? "main";
  const path = `${FOLDER}/${opts.fileName}`;
  const content = await blobToBase64(opts.blob);
  let sha: string | undefined;
  try {
    sha = await fetchExistingSha(path, branch, opts.pat);
  } catch {
    /* ignore */
  }
  const url = `${GH_BASE}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`;
  const body: Record<string, unknown> = {
    message: opts.message,
    content,
    branch,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers(opts.pat), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub PUT 실패: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    content?: { html_url?: string };
    commit?: { html_url?: string };
  };
  return { htmlUrl: json.content?.html_url ?? json.commit?.html_url };
}

export interface ProjectListItem {
  fileName: string;
  size: number;
  downloadUrl: string;
}

/**
 * projects/ 폴더 listing.
 */
export async function listProjectArchives(opts: {
  pat: string;
  branch?: string;
}): Promise<ProjectListItem[]> {
  const branch = opts.branch ?? "main";
  const url = `${GH_BASE}/repos/${OWNER}/${REPO}/contents/${FOLDER}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers(opts.pat) });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`GitHub list 실패: ${res.status} ${await res.text()}`);
  }
  const items = (await res.json()) as {
    name: string;
    size: number;
    download_url: string;
    type: string;
  }[];
  return items
    .filter((i) => i.type === "file" && i.name.endsWith(".mzalign"))
    .map((i) => ({
      fileName: i.name,
      size: i.size,
      downloadUrl: i.download_url,
    }));
}

/**
 * 특정 .mzalign 파일을 raw 다운로드.
 */
export async function downloadProjectArchive(
  downloadUrl: string,
): Promise<Blob> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`GitHub download 실패: ${res.status}`);
  }
  return res.blob();
}
