import { useState, useRef, DragEvent } from "react";
import { uploadSyllabus } from "@/app/lib/syllabus";
import Modal from "@/app/components/Modal";

interface SyllabusUploadModalProps {
  classId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SyllabusUploadModal({
  classId,
  isOpen,
  onClose,
  onSuccess,
}: SyllabusUploadModalProps) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !file) {
      setError("Title and syllabus file are required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await uploadSyllabus(classId, title, file);
      setSuccess(true);
      setTimeout(() => {
        setTitle("");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        onSuccess();
        onClose();
        setSuccess(false);
        setLoading(false);
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Failed to upload syllabus");
      setLoading(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (files && files.length > 0) {
      const selectedFile = files[0];
      const ext = selectedFile.name.split(".").pop()?.toLowerCase();
      if (ext !== "pdf") {
        setError("Unsupported format. Please upload PDF files only.");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setFile(selectedFile);
      setError("");
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Upload Syllabus"
      subtitle="Attach official syllabus PDF for ingestion and AI question generation."
      badge="COURSEWARE"
      maxWidth="max-w-[540px]"
    >
      {success ? (
        <div className="py-10 flex flex-col items-center justify-center text-center animate-fade-in">
          <div className="w-14 h-14 bg-black text-white flex items-center justify-center mb-4 border border-black shadow-[3px_3px_0px_#111111]">
            <span className="material-symbols-outlined text-[28px] text-[#7afbb1]">check</span>
          </div>
          <span className="font-mono text-[10px] text-brand-crimson tracking-[0.2em] uppercase font-bold mb-1">
            STATUS // PROCESSED
          </span>
          <h3 className="font-serif text-2xl font-bold text-on-surface mb-2">
            Syllabus Stored Successfully
          </h3>
          <p className="font-mono text-xs text-secondary flex items-center gap-2">
            <span className="w-2 h-2 bg-brand-crimson animate-ping rounded-full" />
            REDIRECTING TO WORKSPACE...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] text-xs font-mono flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">warning</span>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-mono text-[11px] font-bold uppercase tracking-wider text-on-surface mb-1.5">
              Syllabus Title
            </label>
            <input
              type="text"
              className="w-full border border-black bg-white px-3.5 py-2.5 text-on-surface text-sm font-sans outline-none focus:border-brand-crimson transition-colors"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              placeholder="e.g. Unit 1: Advanced Algorithms"
              required
            />
          </div>

          <div>
            <label className="block font-mono text-[11px] font-bold uppercase tracking-wider text-on-surface mb-1.5">
              PDF Source Document
            </label>

            {!file ? (
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => !loading && fileInputRef.current?.click()}
                className={`border-2 border-dashed p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-brand-crimson bg-brand-crimson/5"
                    : "border-black/20 hover:border-black bg-surface-container-low"
                }`}
              >
                <span className="material-symbols-outlined text-[32px] text-secondary mb-2">
                  upload_file
                </span>
                <p className="font-mono text-xs uppercase font-bold text-on-surface mb-1">
                  {isDragging ? "DROP PDF HERE" : "CHOOSE PDF OR DRAG FILE HERE"}
                </p>
                <p className="font-mono text-[10px] text-secondary uppercase tracking-wider">
                  PDF FORMAT ONLY (MAX 50MB)
                </p>
              </div>
            ) : (
              <div className="border border-black bg-white p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-9 h-9 bg-black text-white flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px]">description</span>
                  </div>
                  <div className="overflow-hidden">
                    <p className="font-sans text-xs font-bold text-on-surface truncate">
                      {file.name}
                    </p>
                    <p className="font-mono text-[10px] text-secondary uppercase tracking-wider">
                      PDF • {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={loading}
                  className="w-7 h-7 flex items-center justify-center text-secondary hover:text-black hover:bg-surface-container transition-colors font-mono text-sm cursor-pointer"
                  title="Remove file"
                >
                  ✕
                </button>
              </div>
            )}

            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={loading}
              ref={fileInputRef}
            />
          </div>

          <div className="pt-4 border-t border-outline-variant flex justify-end gap-3">
            <button
              type="button"
              className="px-4 py-2 border border-black/20 bg-surface-container-low hover:bg-surface-container text-on-surface font-mono text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              type="submit"
              className={`px-5 py-2 bg-brand-dark text-white font-mono text-xs uppercase tracking-widest font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                loading || !title.trim() || !file
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-brand-crimson"
              }`}
              disabled={loading || !title.trim() || !file}
            >
              {loading && (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              <span>{loading ? "UPLOADING..." : "UPLOAD SYLLABUS"}</span>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
