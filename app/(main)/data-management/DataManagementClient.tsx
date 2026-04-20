"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/auth";
import { canUpload } from "@/lib/auth";
import { Upload, Trash2 } from "lucide-react";
import { CheckCircle, XCircle } from "lucide-react";
import { FileSpreadsheet } from "lucide-react";

type Tab = "upload" | "history";

export default function DataManagementClient({
  role,
}: {
  role: UserRole | null;
}) {
  const allowUpload = canUpload(role);
  const [tab, setTab] = useState<Tab>("upload");

  return (
    <div className="space-y-8">
      <div className="rounded-[28px] border border-[#D4E8C2] bg-white px-8 py-7 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#1A4731] md:text-4xl">
              Data Management
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#4A6A56] md:text-base">
              Manage Excel files for preview, visualization, and AI analysis in a centralized workspace.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:w-auto">
          </div>
        </div>
      </div>

      <div className="inline-flex rounded-full border border-[#D4E8C2] bg-[#F7F8F5] p-1.5 shadow-inner">
        <button
          onClick={() => setTab("upload")}
          className={["rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-200", tab === "upload" ? "bg-[#8DC63F] text-[#1A4731] shadow-md" : "text-[#4A6A56] hover:bg-[#EEF7DC] hover:text-[#1A4731]"].join(" ")}
        >Upload</button>
        <button
          onClick={() => setTab("history")}
          className={["rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-200", tab === "history" ? "bg-[#8DC63F] text-[#1A4731] shadow-md" : "text-[#4A6A56] hover:bg-[#EEF7DC] hover:text-[#1A4731]"].join(" ")}
        >History File</button>
      </div>

      <div>
        {tab === "upload" ? <UploadPanel allowUpload={allowUpload} /> : <HistoryPanel role={role} />}
      </div>
    </div>
  );
}

function UploadPanel({ allowUpload }: { allowUpload: boolean }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [notify, setNotify] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") {
      setNotify({ type: "error", msg: "Only Excel files (.xlsx / .xls) are allowed." });
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/files/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      await fetch("/api/active-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: data.fileId }),
      });
      setNotify({ type: "success", msg: `File "${file.name}" uploaded successfully` });
      setTimeout(() => { router.refresh(); }, 2000);
    } catch {
      setNotify({ type: "error", msg: "Upload failed. Please try again." });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <>
      {notify && (
        <div className={["mb-4 flex items-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold shadow-lg", notify.type === "success" ? "bg-[#8DC63F] text-[#1A4731]" : "bg-red-500 text-white"].join(" ")}>
          {notify.type === "success" ? <CheckCircle size={18} color="#1A4731" /> : <XCircle size={18} color="white" />}
          {notify.msg}
        </div>
      )}
      <div className="rounded-[28px] border border-[#D4E8C2] bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="lg:w-[320px]">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#8DC63F] text-2xl text-[#1A4731] shadow-md">
              <Upload size={24} color="#1A4731" />
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-[#1A4731]">Upload Latest Excel File</h3>
            <p className="mt-2 text-sm leading-6 text-[#4A6A56]">Upload the latest Excel file to directly convert it into data in the system. The uploaded file will be available for preview, visualization, and AI analysis.</p>
          </div>
          <div className="flex-1 rounded-[24px] border border-[#D4E8C2] bg-[#F7F8F5] p-5">
            <div className="flex h-full min-h-[250px] flex-col justify-between rounded-[22px] border border-dashed border-[#8DC63F]/50 bg-[#EEF7DC] p-6 text-[#1A4731] shadow-inner">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Upload size={28} color="#1A4731" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{uploading ? "Uploading file..." : "Drop file here"}</p>
                    <p className="mt-1 text-sm text-[#4A6A56]">Supported format: .xlsx</p>
                  </div>
                </div>
              </div>
              <div className="mt-8 flex flex-col gap-4 border-t border-[#1A4731]/10 pt-5 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  {allowUpload ? (
                    <span className="font-medium text-[#1A4731]">Access granted. You can upload file.</span>
                  ) : (
                    <span className="font-medium text-[#4A6A56]">Upload only for <span className="font-semibold text-[#1A4731]">Strategic Planning & Operations Control</span>. You can still access file history.</span>
                  )}
                </div>
                <label className={["inline-flex cursor-pointer items-center justify-center rounded-full px-6 py-3 text-sm font-semibold shadow-sm transition-all duration-200", !allowUpload || uploading ? "cursor-not-allowed bg-white/60 text-[#4A6A56]/50" : "bg-[#1A4731] text-white hover:-translate-y-0.5 hover:bg-[#15392A] active:scale-95"].join(" ")}>
                  {uploading ? "Uploading..." : "Browse Files"}
                  <input type="file" className="hidden" accept=".xlsx,.xls" disabled={!allowUpload || uploading} onChange={handleFileChange} />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function HistoryPanel({ role }: { role: UserRole | null }) {
  const canDelete = role === "spoc";
  const router = useRouter();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string } | null>(null);
  const [successNotif, setSuccessNotif] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/files", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setRows(json.items ?? json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function formatDate(ts: string) {
    const d = new Date(ts);
    const date = d.toLocaleDateString("id-ID", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" });
    const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).replace(/\./g, ":");
    return { date, time };
  }

  async function selectFile(fileId: string) {
    await fetch("/api/active-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    });
    router.refresh();
  }

  function openDeleteModal(fileId: string, fileName: string) {
    setDeleteModal({ id: fileId, name: fileName });
  }

  async function confirmDelete() {
    if (!deleteModal) return;
    const { id, name } = deleteModal;
    setBusyId(id);
    setDeleteModal(null);
    try {
      const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json?.error ?? "Delete failed");
        return;
      }
      setSuccessNotif(`File "${name}" deleted successfully.`);
      setTimeout(() => setSuccessNotif(null), 3000);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="rounded-[28px] border border-[#D4E8C2] bg-white p-8 text-[#4A6A56] shadow-[0_12px_40px_rgba(0,0,0,0.06)]">Loading history...</div>;
  }

  if (!rows.length) {
    return <div className="rounded-[28px] border border-[#D4E8C2] bg-white p-8 text-[#4A6A56] shadow-[0_12px_40px_rgba(0,0,0,0.06)]">No files uploaded yet.</div>;
  }

  return (
    <>
      {/* Success notification */}
      {successNotif && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[#8DC63F] px-5 py-4 text-sm font-semibold text-[#1A4731] shadow-lg">
          <CheckCircle size={18} color="#1A4731" />
          {successNotif}
        </div>
      )}

      <div className="rounded-[28px] border border-[#D4E8C2] bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-[#1A4731]">History File</h3>
            <p className="mt-1 text-sm text-[#4A6A56]">Only Strategic Planning & Operations Control can delete file</p>
          </div>
          <div className="rounded-full border border-[#8DC63F]/30 bg-[#EEF7DC] px-4 py-2 text-xs font-semibold text-[#1A4731]">
            {rows.length} files
          </div>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-[#D4E8C2] bg-white">
            <div className={["border-b border-[#D4E8C2] bg-[#F4F7F2] px-5 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#3A5A3A]", canDelete ? "grid grid-cols-[200px_1fr_140px_110px]" : "grid grid-cols-[200px_1fr_140px]"].join(" ")}>
              <div>Timestamp</div>
              <div>File Name</div>
              <div>Uploaded by</div>
              {canDelete && <div className="text-center">Action</div>}
            </div>

          <div className="divide-y divide-[#F0F5EE]">
            {rows.map((r: any, index: number) => {
              const { date, time } = formatDate(r.uploaded_at);
              const isLatest = index === 0;
              return (
                <div key={r.id} className={["items-center px-5 transition-colors", canDelete ? "grid grid-cols-[200px_1fr_140px_110px]" : "grid grid-cols-[200px_1fr_140px]", isLatest ? "border-l-[3px] border-l-[#4A9B2E] bg-[#F0FAE8] hover:bg-[#E8F7DC]" : "hover:bg-[#F4FBF0]"].join(" ")} style={{ minHeight: "64px" }}>
                  <div className="flex flex-col gap-0.5 py-4">
                    <span className="text-xs font-semibold text-[#2C4A2C]">{date}</span>
                    <span className="font-mono text-xs text-[#7AAA7A]">{time}</span>
                  </div>
                  <div className="py-4 pr-4">
                    <button onClick={() => selectFile(String(r.id))} className="group flex w-full items-center gap-3 text-left">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF3E0]">
                        <FileSpreadsheet size={16} color="#3B6D11" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1A3A1A] group-hover:underline">{r.file_name}</p>
                        <span className={["mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", isLatest ? "bg-[#D4EDBA] text-[#2E6B10]" : "bg-zinc-100 text-zinc-500"].join(" ")}>
                          {isLatest ? "Latest uploaded file" : "Stored file"}
                        </span>
                      </div>
                    </button>
                  </div>
                  <div className="py-4 pr-4">
                    <span className="text-xs font-medium text-[#4A6A56]">
                      {r.username || "-"}
                    </span>
                  </div>
                  {canDelete && (
                    <div className="flex justify-center py-4">
                      <button
                        onClick={() => openDeleteModal(String(r.id), r.file_name)}
                        disabled={busyId === String(r.id)}
                        className={["rounded-lg px-4 py-2 text-xs font-semibold transition", busyId === String(r.id) ? "cursor-not-allowed bg-zinc-200 text-zinc-500" : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"].join(" ")}
                      >
                        {busyId === String(r.id) ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}
          onClick={(e) => e.target === e.currentTarget && setDeleteModal(null)}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100">
                <Trash2 size={20} color="#DC2626" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-[#1A4731]">Delete file</h4>
                <p className="text-xs text-[#4A6A56]">This action cannot be reversed once completed</p>
              </div>
            </div>

            <p className="mb-2 text-sm text-[#4A6A56]">Are you sure you want to delete this file?</p>
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#D4E8C2] bg-[#F7F8F5] px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#3B6D11" strokeWidth="1.5" />
                <path d="M14 2v6h6" stroke="#3B6D11" strokeWidth="1.5" />
              </svg>
              <span className="text-sm font-semibold text-[#1A4731]">{deleteModal.name}</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 rounded-2xl border border-[#D4E8C2] px-4 py-3 text-sm font-semibold text-[#4A6A56] transition-all hover:bg-[#F7F8F5]"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-red-700"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}