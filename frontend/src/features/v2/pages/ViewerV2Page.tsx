import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";

import { useProjectV2 } from "../hooks/useProjectsV2";
import { useStlFilesV2 } from "../hooks/useStlFilesV2";
import { useSupportsV2 } from "../hooks/useSupportsV2";
import {
  useShortcutsListener,
  useShortcutHandler,
} from "../hooks/useShortcuts";
import { useClipboardStore } from "../hooks/useClipboardStore";
import { useUndoStore } from "../hooks/useUndoStore";
import { SupportParamsPanel, useSupportParamsStore } from "../support";
import * as supportRepo from "../data/supports.repo";
import type { SupportPointV2 } from "../support/types";
import { downloadBlob } from "../utils/stl-export";
import { exportLayersAsPngZip } from "../utils/slice-batch";
import { makeCtbV4 } from "../utils/ctb-encoder";
import BabylonScene, {
  type BabylonSceneHandle,
  type GizmoMode,
} from "../components/BabylonScene";
import LocalFileBrowser from "../components/LocalFileBrowser";
import ViewControls from "../components/ViewControls";
import StlFileList from "../components/StlFileList";
import TransformPanel from "../components/TransformPanel";
import GizmoControls from "../components/GizmoControls";
import EditModeControls, {
  type EditMode,
} from "../components/EditModeControls";
import SliceSidePanel from "../components/SliceSidePanel";
import PrinterProfileSelect from "../components/PrinterProfileSelect";
import PrinterProfileDialog from "../components/PrinterProfileDialog";
import { useCurrentProfile } from "../hooks/usePrinterProfileStore";
import { IDENTITY_TRANSFORM, type TransformV2 } from "../types/transform";

/**
 * v2 프로젝트 작업 화면.
 */
const ViewerV2Page: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { project, loading, error } = useProjectV2(projectId);

  const {
    files,
    loading: filesLoading,
    add: addStlFile,
    remove: removeStlFile,
    updateTransform,
  } = useStlFilesV2(projectId);

  const {
    supports,
    addMany: addSupports,
    clearAll: clearAllSupports,
    refresh: refreshSupports,
    patchSupport,
  } = useSupportsV2(projectId);

  const [browserOpen, setBrowserOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("none");
  const [editMode, setEditMode] = useState<EditMode>("select");
  const [bridgeMode, setBridgeMode] = useState(false);
  const [pendingBridge, setPendingBridge] = useState<{
    stlId: string;
    contact: [number, number, number];
  } | null>(null);
  const [selectedSupportId, setSelectedSupportId] = useState<string | null>(
    null,
  );
  const [autoBusy, setAutoBusy] = useState(false);
  const [slicePreview, setSlicePreview] = useState<{
    on: boolean;
    layerIdx: number;
    layerHeightMm: number;
  }>({ on: false, layerIdx: 0, layerHeightMm: 0.05 });
  const [sceneTopY, setSceneTopY] = useState(0);
  const [batchExport, setBatchExport] = useState<{
    busy: boolean;
    done: number;
    total: number;
  }>({ busy: false, done: 0, total: 0 });
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  // sliceY = (layerIdx + 0.5) × layerHeight — 레이어 중심을 픽업
  const sliceYNow =
    (slicePreview.layerIdx + 0.5) * slicePreview.layerHeightMm;
  const layerCount = Math.max(
    1,
    Math.ceil(sceneTopY / slicePreview.layerHeightMm),
  );
  const sceneHandleRef = useRef<BabylonSceneHandle>(null);

  const overhangAngleDeg = useSupportParamsStore(
    (s) => s.params.overhangAngleDeg,
  );
  const supportParams = useSupportParamsStore((s) => s.params);

  const printerProfile = useCurrentProfile();

  useShortcutsListener();

  // Bridge pending 상태에서 Esc 누르면 취소.
  useEffect(() => {
    if (!pendingBridge) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingBridge(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingBridge]);

  // ----- 선택 -----
  const handlePick = useCallback(
    (id: string | null, opts: { multi: boolean }) => {
      setSelectedIds((prev) => {
        if (!id) return opts.multi ? prev : new Set();
        const next = new Set(prev);
        if (opts.multi) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }
        return new Set([id]);
      });
    },
    [],
  );

  // ----- 클립보드 -----
  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(files.map((f) => f.id)));
  }, [files]);

  const handleCopy = useCallback(() => {
    if (selectedIds.size === 0) return;
    const items = files
      .filter((f) => selectedIds.has(f.id))
      .map((f) => ({ fileName: f.fileName, blob: f.blob }));
    useClipboardStore.getState().set(items);
  }, [files, selectedIds]);

  const handleCut = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const toCut = files.filter((f) => selectedIds.has(f.id));
    useClipboardStore
      .getState()
      .set(toCut.map((f) => ({ fileName: f.fileName, blob: f.blob })));
    for (const f of toCut) {
      await removeStlFile(f.id);
    }
    setSelectedIds(new Set());
  }, [files, selectedIds, removeStlFile]);

  const handlePaste = useCallback(async () => {
    const items = useClipboardStore.getState().items;
    if (items.length === 0) return;
    const newIds: string[] = [];
    for (const item of items) {
      const created = await addStlFile(
        addCopySuffix(item.fileName, files),
        item.blob,
      );
      newIds.push(created.id);
    }
    setSelectedIds(new Set(newIds));
  }, [files, addStlFile]);

  // ----- Undo / Redo -----
  const handleUndo = useCallback(() => {
    void useUndoStore.getState().undo();
  }, []);
  const handleRedo = useCallback(() => {
    void useUndoStore.getState().redo();
  }, []);

  useShortcutHandler("selectAll", handleSelectAll);
  useShortcutHandler("copy", handleCopy);
  useShortcutHandler("cut", handleCut);
  useShortcutHandler("paste", handlePaste);
  useShortcutHandler("undo", handleUndo);
  useShortcutHandler("redo", handleRedo);
  // 'delete' 핸들러는 아래의 handleDeleteSelectedSupport 선언 후에 등록한다.

  // ----- 자동 서포트 -----
  const handleAutoGenerate = useCallback(async () => {
    if (!projectId || autoBusy) return;
    if (files.length === 0) return;
    setAutoBusy(true);
    try {
      const generated =
        sceneHandleRef.current?.generateAutoSupports(projectId, supportParams) ??
        [];
      if (generated.length === 0) return;

      const ids = generated.map((p) => p.id);
      await addSupports(generated);

      useUndoStore.getState().push({
        label: "auto-supports",
        undo: async () => {
          for (const id of ids) {
            await supportRepo.deleteSupport(id);
          }
          await refreshSupports();
        },
        redo: async () => {
          await addSupports(generated);
        },
      });
    } finally {
      setAutoBusy(false);
    }
  }, [projectId, autoBusy, files.length, supportParams, addSupports, refreshSupports]);

  // ----- 수동 편집 -----
  const handleAddSupportAt = useCallback(
    async (stlId: string, contact: [number, number, number]) => {
      if (!projectId) return;

      // Bridge 모드: 첫 클릭은 pending, 두 번째 클릭에 둘을 잇는 기둥.
      if (bridgeMode) {
        if (!pendingBridge) {
          // 첫 점 — pending 설정 (선택 해제 X).
          if (contact[1] <= 0.5) return; // 베드 근처 무의미
          setPendingBridge({ stlId, contact });
          return;
        }
        // 두 번째 점 — 두 점을 잇는 bridge 서포트 추가.
        const a = pendingBridge.contact;
        const b = contact;
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const dz = a[2] - b[2];
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 1.0) {
          // 거의 같은 점이면 무시.
          return;
        }
        // 변곡점 3 개 자동 배치: t = 0.25 / 0.50 / 0.75. 직선 상태.
        const lerp = (t: number): [number, number, number] => [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ];
        // 직선 경로가 STL 과 교차하면 변곡점을 자동으로 들어올린다.
        // 양 끝이 닿아있는 두 모델은 충돌 검사에서 제외.
        const initialCps: [
          [number, number, number],
          [number, number, number],
          [number, number, number],
        ] = [lerp(0.25), lerp(0.5), lerp(0.75)];
        const routedCps =
          sceneHandleRef.current?.autoRouteBridge(a, b, initialCps, [
            stlId,
            pendingBridge.stlId,
          ]) ?? initialCps;
        const newPoint: SupportPointV2 = {
          id: crypto.randomUUID(),
          projectId,
          stlId, // 두 번째 클릭의 모델 (contact 쪽)
          baseStlId: pendingBridge.stlId, // 첫 번째 클릭의 모델 (base 쪽)
          // base = 첫 점, contact = 두 번째 점.
          // (createSupportMesh 는 base→contact 방향으로 그린다.)
          contact: b,
          base: a,
          source: "bridge",
          addedAt: Date.now(),
          curveControlPoints: routedCps,
        };
        setPendingBridge(null);
        await addSupports([newPoint]);
        useUndoStore.getState().push({
          label: "add-bridge",
          undo: async () => {
            await supportRepo.deleteSupport(newPoint.id);
            await refreshSupports();
          },
          redo: async () => {
            await addSupports([newPoint]);
          },
        });
        return;
      }

      // 단점 모드 (기존).
      if (contact[1] <= 0.5) return;
      const newPoint: SupportPointV2 = {
        id: crypto.randomUUID(),
        projectId,
        stlId,
        contact,
        base: [contact[0], 0, contact[2]],
        source: "manual",
        addedAt: Date.now(),
      };
      await addSupports([newPoint]);
      useUndoStore.getState().push({
        label: "add-support",
        undo: async () => {
          await supportRepo.deleteSupport(newPoint.id);
          await refreshSupports();
        },
        redo: async () => {
          await addSupports([newPoint]);
        },
      });
    },
    [projectId, bridgeMode, pendingBridge, addSupports, refreshSupports],
  );

  const handleRemoveSupport = useCallback(
    async (supportId: string) => {
      const target = supports.find((s) => s.id === supportId);
      if (!target) return;
      await supportRepo.deleteSupport(supportId);
      await refreshSupports();
      if (selectedSupportId === supportId) setSelectedSupportId(null);
      useUndoStore.getState().push({
        label: "remove-support",
        undo: async () => {
          await addSupports([target]);
        },
        redo: async () => {
          await supportRepo.deleteSupport(supportId);
          await refreshSupports();
        },
      });
    },
    [supports, addSupports, refreshSupports, selectedSupportId],
  );

  const handleMoveSupport = useCallback(
    async (id: string, newBaseXZ: [number, number]) => {
      const target = supports.find((s) => s.id === id);
      if (!target) return;

      const oldContact: [number, number, number] = [...target.contact];
      const oldBase: [number, number, number] = [...target.base];
      const newContact: [number, number, number] = [
        newBaseXZ[0],
        target.contact[1], // contact 의 Y 는 유지
        newBaseXZ[1],
      ];
      const newBase: [number, number, number] = [
        newBaseXZ[0],
        0,
        newBaseXZ[1],
      ];

      await patchSupport(id, { contact: newContact, base: newBase });

      useUndoStore.getState().push({
        label: "move-support",
        undo: async () => {
          await patchSupport(id, { contact: oldContact, base: oldBase });
        },
        redo: async () => {
          await patchSupport(id, { contact: newContact, base: newBase });
        },
      });
    },
    [supports, patchSupport],
  );

  const handleMoveBridgeControlPoint = useCallback(
    async (
      supportId: string,
      idx: 0 | 1 | 2,
      pos: [number, number, number],
    ) => {
      const target = supports.find((s) => s.id === supportId);
      if (!target || !target.curveControlPoints) return;
      const oldCps = target.curveControlPoints;
      const proposed: typeof oldCps = [oldCps[0], oldCps[1], oldCps[2]];
      proposed[idx] = pos;

      // 새 경로가 STL 과 교차하면 변곡점 자동 lift.
      const excludeIds = [target.stlId];
      if (target.baseStlId) excludeIds.push(target.baseStlId);
      const newCps =
        sceneHandleRef.current?.autoRouteBridge(
          target.base,
          target.contact,
          proposed,
          excludeIds,
        ) ?? proposed;

      await patchSupport(supportId, { curveControlPoints: newCps });

      useUndoStore.getState().push({
        label: "move-bridge-cp",
        undo: async () => {
          await patchSupport(supportId, { curveControlPoints: oldCps });
        },
        redo: async () => {
          await patchSupport(supportId, { curveControlPoints: newCps });
        },
      });
    },
    [supports, patchSupport],
  );

  const handleMoveBridgeEndpoint = useCallback(
    async (
      supportId: string,
      which: "base" | "contact",
      pos: [number, number, number],
    ) => {
      const target = supports.find((s) => s.id === supportId);
      if (!target || target.source !== "bridge") return;

      const oldBase = target.base;
      const oldContact = target.contact;
      const oldCps = target.curveControlPoints;

      const newBase: [number, number, number] =
        which === "base" ? pos : oldBase;
      const newContact: [number, number, number] =
        which === "contact" ? pos : oldContact;

      // 변곡점 비례 이동: t = 0.25 / 0.50 / 0.75 위치 기준으로
      // (Δbase × (1-t)) + (Δcontact × t) 만큼 함께 이동.
      // 사용자가 휘어놓은 곡선 모양이 그대로 유지된다.
      let newCps = oldCps;
      if (oldCps) {
        const dBase: [number, number, number] = [
          newBase[0] - oldBase[0],
          newBase[1] - oldBase[1],
          newBase[2] - oldBase[2],
        ];
        const dContact: [number, number, number] = [
          newContact[0] - oldContact[0],
          newContact[1] - oldContact[1],
          newContact[2] - oldContact[2],
        ];
        const ts = [0.25, 0.5, 0.75];
        const shifted = ts.map((t, i): [number, number, number] => {
          const w0 = 1 - t;
          return [
            oldCps[i][0] + dBase[0] * w0 + dContact[0] * t,
            oldCps[i][1] + dBase[1] * w0 + dContact[1] * t,
            oldCps[i][2] + dBase[2] * w0 + dContact[2] * t,
          ];
        });
        newCps = [shifted[0], shifted[1], shifted[2]];

        // 새 경로가 STL 과 교차하면 변곡점 자동 lift.
        const excludeIds = [target.stlId];
        if (target.baseStlId) excludeIds.push(target.baseStlId);
        newCps =
          sceneHandleRef.current?.autoRouteBridge(
            newBase,
            newContact,
            newCps,
            excludeIds,
          ) ?? newCps;
      }

      const patch: Parameters<typeof patchSupport>[1] = {
        base: newBase,
        contact: newContact,
      };
      if (newCps) patch.curveControlPoints = newCps;
      await patchSupport(supportId, patch);

      useUndoStore.getState().push({
        label: "move-bridge-endpoint",
        undo: async () => {
          const undoPatch: Parameters<typeof patchSupport>[1] = {
            base: oldBase,
            contact: oldContact,
          };
          if (oldCps) undoPatch.curveControlPoints = oldCps;
          await patchSupport(supportId, undoPatch);
        },
        redo: async () => {
          await patchSupport(supportId, patch);
        },
      });
    },
    [supports, patchSupport],
  );

  const handleDeleteSelectedSupport = useCallback(() => {
    if (editMode !== "support" || !selectedSupportId) return;
    void handleRemoveSupport(selectedSupportId);
  }, [editMode, selectedSupportId, handleRemoveSupport]);

  useShortcutHandler("delete", handleDeleteSelectedSupport);

  // ----- 마스크 ZIP 내보내기 -----
  const handleExportMasksZip = useCallback(async () => {
    const handle = sceneHandleRef.current;
    if (!handle || files.length === 0) return;
    if (batchExport.busy) return;
    setBatchExport({ busy: true, done: 0, total: 0 });
    try {
      const blob = await exportLayersAsPngZip(handle, {
        layerHeightMm: slicePreview.layerHeightMm,
        widthPx: printerProfile.lcdWidthPx,
        heightPx: printerProfile.lcdHeightPx,
        plateWidthMm: printerProfile.buildVolumeMm[0],
        plateDepthMm: printerProfile.buildVolumeMm[1],
        onProgress: (done, total) =>
          setBatchExport({ busy: true, done, total }),
      });
      if (!blob) return;
      const safe = (project?.name ?? "project").replace(
        /[\\/:*?"<>|]/g,
        "_",
      );
      const lh = slicePreview.layerHeightMm.toFixed(3).replace(".", "_");
      downloadBlob(blob, `${safe}_layers_${lh}mm.zip`);
    } finally {
      setBatchExport({ busy: false, done: 0, total: 0 });
    }
  }, [
    files.length,
    project?.name,
    slicePreview.layerHeightMm,
    batchExport.busy,
  ]);

  // ----- .ctb v4 내보내기 -----
  const handleExportCtb = useCallback(async () => {
    const handle = sceneHandleRef.current;
    if (!handle || files.length === 0) return;
    if (batchExport.busy) return;
    setBatchExport({ busy: true, done: 0, total: 0 });
    try {
      const blob = await makeCtbV4(handle, {
        layerHeightMm: slicePreview.layerHeightMm,
        resolutionX: printerProfile.lcdWidthPx,
        resolutionY: printerProfile.lcdHeightPx,
        bedSizeXMm: printerProfile.buildVolumeMm[0],
        bedSizeYMm: printerProfile.buildVolumeMm[1],
        bedSizeZMm: printerProfile.buildVolumeMm[2],
        onProgress: (done, total) =>
          setBatchExport({ busy: true, done, total }),
      });
      if (!blob) return;
      const safe = (project?.name ?? "project").replace(
        /[\\/:*?"<>|]/g,
        "_",
      );
      downloadBlob(blob, `${safe}_v3.ctb`);
    } finally {
      setBatchExport({ busy: false, done: 0, total: 0 });
    }
  }, [files.length, project?.name, slicePreview.layerHeightMm, batchExport.busy]);

  // ----- STL 내보내기 -----
  const handleExportStl = useCallback(() => {
    if (files.length === 0) return;
    const blob = sceneHandleRef.current?.exportStl();
    if (!blob) return;
    const safe = (project?.name ?? "project").replace(/[\\/:*?"<>|]/g, "_");
    const suffix = supports.length > 0 ? "_supported" : "";
    downloadBlob(blob, `${safe}${suffix}.stl`);
  }, [files.length, project?.name, supports.length]);

  const handleClearAllSupports = useCallback(async () => {
    if (!projectId) return;
    if (supports.length === 0) return;
    const snapshot: SupportPointV2[] = supports.slice();
    await clearAllSupports();
    useUndoStore.getState().push({
      label: "clear-supports",
      undo: async () => {
        await addSupports(snapshot);
      },
      redo: async () => {
        await clearAllSupports();
      },
    });
  }, [projectId, supports, clearAllSupports, addSupports]);

  // ----- Transform -----
  const handlePreviewTransform = useCallback(
    (id: string, t: TransformV2) => {
      sceneHandleRef.current?.previewTransform(id, t);
    },
    [],
  );

  const handleCommitTransform = useCallback(
    (id: string, start: TransformV2, end: TransformV2) => {
      // 즉시 DB 반영. (그 사이 메쉬는 이미 preview 로 반영돼 있음)
      void updateTransform(id, end);
      // Undo entry 등록 — undo/redo 모두 DB 반영 (씬도 따라 갱신)
      useUndoStore.getState().push({
        label: "transform",
        undo: async () => {
          await updateTransform(id, start);
        },
        redo: async () => {
          await updateTransform(id, end);
        },
      });
    },
    [updateTransform],
  );

  if (!projectId) {
    return <Navigate to="/v2/projects" replace />;
  }

  // ----- 파일 추가/삭제 -----
  async function handlePicked(file: { name: string; blob: Blob }) {
    setBrowserOpen(false);
    const created = await addStlFile(file.name, file.blob);
    setSelectedIds(new Set([created.id]));
  }

  async function handleRemove(id: string) {
    await removeStlFile(id);
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // 단일 선택만 Transform 패널에 표시.
  const selectedFile =
    selectedIds.size === 1
      ? files.find((f) => selectedIds.has(f.id)) ?? null
      : null;
  const transformPanelSelected = selectedFile
    ? {
        id: selectedFile.id,
        fileName: selectedFile.fileName,
        transform: selectedFile.transform ?? IDENTITY_TRANSFORM,
      }
    : null;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <header className="bg-white border-b">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/v2/projects")}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Projects
            </button>
            <h1 className="text-lg font-semibold text-gray-900">
              {project?.name ?? (loading ? "Loading…" : "Unknown project")}
            </h1>
            {project && (
              <span className="text-xs text-gray-500 font-mono">
                {project.code}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <PrinterProfileSelect onEdit={() => setProfileDialogOpen(true)} />
            <button
              onClick={() => {
                setSlicePreview((s) => {
                  if (!s.on) {
                    const top = sceneHandleRef.current?.getSceneTopY() ?? 0;
                    setSceneTopY(top);
                  }
                  return { ...s, on: !s.on };
                });
              }}
              className={`px-3 py-1 text-sm border rounded transition-colors ${
                slicePreview.on
                  ? "bg-primary-600 text-white border-primary-600"
                  : "text-primary-700 border-primary-600 hover:bg-primary-50"
              }`}
            >
              슬라이스 미리보기
            </button>
            <button
              onClick={handleExportStl}
              disabled={files.length === 0}
              className="px-3 py-1 text-sm text-primary-700 border border-primary-600 rounded hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              STL 내보내기
            </button>
            <button
              onClick={() => setBrowserOpen(true)}
              className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
            >
              STL 불러오기
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <StlFileList
          files={files}
          selectedIds={selectedIds}
          onPick={(id, opts) => handlePick(id, opts)}
          onAdd={() => setBrowserOpen(true)}
          onRemove={handleRemove}
          loading={filesLoading}
        />

        <main className="flex-1 relative bg-gray-100">
          <BabylonScene
            ref={sceneHandleRef}
            files={files}
            selectedIds={selectedIds}
            onPick={handlePick}
            overhangAngleDeg={overhangAngleDeg}
            gizmoMode={gizmoMode}
            onGizmoCommit={handleCommitTransform}
            supports={supports}
            supportParams={supportParams}
            plateWidthMm={printerProfile.buildVolumeMm[0]}
            plateDepthMm={printerProfile.buildVolumeMm[1]}
            editMode={editMode}
            onAddSupportAt={handleAddSupportAt}
            onPickSupport={setSelectedSupportId}
            selectedSupportId={selectedSupportId}
            onMoveSupport={handleMoveSupport}
            pendingBridgePoint={pendingBridge?.contact ?? null}
            bridgeMode={bridgeMode}
            sliceY={slicePreview.on ? sliceYNow : null}
            onMoveBridgeControlPoint={handleMoveBridgeControlPoint}
            onMoveBridgeEndpoint={handleMoveBridgeEndpoint}
          />

          <ViewControls
            onSetView={(p) => sceneHandleRef.current?.setView(p)}
            onFit={() => sceneHandleRef.current?.fit()}
          />

          <GizmoControls
            mode={gizmoMode}
            onChange={setGizmoMode}
            enabled={selectedIds.size === 1 && editMode === "select"}
          />

          <EditModeControls
            mode={editMode}
            onChange={(m) => {
              setEditMode(m);
              if (m === "select") {
                setSelectedSupportId(null);
                setBridgeMode(false);
                setPendingBridge(null);
              }
            }}
          />

          {editMode === "support" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/95 backdrop-blur rounded-md shadow px-3 py-2 text-xs text-gray-700">
              {bridgeMode ? (
                <span className="pointer-events-none">
                  <strong>Bridge 모드</strong> ·{" "}
                  {pendingBridge
                    ? "두 번째 지점을 클릭"
                    : "첫 번째 지점을 클릭"}{" "}
                  · <kbd className="px-1 border rounded">Esc</kbd> = 취소
                </span>
              ) : (
                <span className="pointer-events-none">
                  <strong>서포트 편집</strong> · 모델 표면 = 추가 · 기둥 클릭
                  = 선택 · <kbd className="px-1 border rounded">Delete</kbd> =
                  삭제
                </span>
              )}
              <button
                onClick={() => {
                  setBridgeMode((v) => !v);
                  setPendingBridge(null);
                }}
                className={`px-2 py-0.5 text-xs border rounded transition-colors ${
                  bridgeMode
                    ? "bg-primary-600 text-white border-primary-600"
                    : "border-primary-600 text-primary-700 hover:bg-primary-50"
                }`}
              >
                Bridge
              </button>
              <button
                onClick={handleDeleteSelectedSupport}
                disabled={!selectedSupportId || bridgeMode}
                className="px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                선택 삭제
              </button>
            </div>
          )}


          {files.length > 0 ? (
            <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-md shadow px-3 py-2 text-xs text-gray-700 space-y-1 pointer-events-none">
              <div className="flex items-center space-x-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: "rgb(255, 82, 82)" }}
                />
                <span>Overhang (≤ {overhangAngleDeg}°)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: "rgb(199, 202, 212)" }}
                />
                <span>Safe</span>
              </div>
            </div>
          ) : (
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
              <div className="bg-white/90 backdrop-blur rounded-md shadow px-4 py-3 text-sm text-gray-600">
                좌측 '+ 추가' 또는 상단 'STL 불러오기' 로 파일을 가져오세요.
              </div>
            </div>
          )}

          <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur rounded-md shadow px-3 py-2 text-xs text-gray-600 pointer-events-none">
            <div className="flex items-center space-x-2">
              <span
                className="inline-block w-3 h-1 rounded"
                style={{ background: "rgb(255,77,77)" }}
              />
              <span>X</span>
              <span
                className="inline-block w-3 h-1 rounded ml-2"
                style={{ background: "rgb(77,230,102)" }}
              />
              <span>Y (위)</span>
              <span
                className="inline-block w-3 h-1 rounded ml-2"
                style={{ background: "rgb(89,140,255)" }}
              />
              <span>Z</span>
            </div>
            <div className="mt-1 text-gray-500">
              플레이트 {printerProfile.buildVolumeMm[0].toFixed(1)} ×{" "}
              {printerProfile.buildVolumeMm[1].toFixed(1)} mm · 격자 10 mm
            </div>
          </div>
        </main>

        {slicePreview.on && (
          <SliceSidePanel
            onClose={() =>
              setSlicePreview({
                on: false,
                layerIdx: 0,
                layerHeightMm: 0.05,
              })
            }
            sceneHandleRef={sceneHandleRef}
            sliceYNow={sliceYNow}
            layerIdx={slicePreview.layerIdx}
            layerHeightMm={slicePreview.layerHeightMm}
            layerCount={layerCount}
            sceneTopY={sceneTopY}
            onLayerIdxChange={(i) =>
              setSlicePreview((s) => ({ ...s, layerIdx: i }))
            }
            onLayerHeightChange={(mm) =>
              setSlicePreview((s) => ({ ...s, layerHeightMm: mm }))
            }
            onExportMasksZip={() => void handleExportMasksZip()}
            onExportCtb={() => void handleExportCtb()}
            batchBusy={batchExport.busy}
            batchDone={batchExport.done}
            batchTotal={batchExport.total}
            modelCount={files.length}
          />
        )}

        <aside className="w-80 border-l bg-white overflow-y-auto">
          {error && (
            <p className="text-red-600 text-sm m-4">
              프로젝트 조회 실패: {error.message}
            </p>
          )}
          <div className="p-4 space-y-4">
            <TransformPanel
              selected={transformPanelSelected}
              onPreview={handlePreviewTransform}
              onCommit={handleCommitTransform}
            />
            <SupportParamsPanel
              onAutoGenerate={handleAutoGenerate}
              onClearAll={handleClearAllSupports}
              supportCount={supports.length}
              busy={autoBusy}
            />
          </div>
        </aside>
      </div>

      {browserOpen && (
        <LocalFileBrowser
          onSelect={handlePicked}
          onClose={() => setBrowserOpen(false)}
        />
      )}

      <PrinterProfileDialog
        open={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
      />

    </div>
  );
};

function addCopySuffix(name: string, existing: { fileName: string }[]): string {
  const existingNames = new Set(existing.map((e) => e.fileName));
  if (!existingNames.has(name)) return name;
  const dotIdx = name.lastIndexOf(".");
  const stem = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
  let candidate = `${stem} (copy)${ext}`;
  let i = 2;
  while (existingNames.has(candidate)) {
    candidate = `${stem} (copy ${i})${ext}`;
    i++;
  }
  return candidate;
}

export default ViewerV2Page;
