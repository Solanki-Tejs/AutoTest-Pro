import { useState, useRef, DragEvent } from "react";
import { uploadSyllabus } from "@/app/lib/syllabus";

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
      setError("Title and file are required.");
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
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to upload syllabus");
      setLoading(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (files && files.length > 0) {
      const selectedFile = files[0];
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      if (ext !== "pdf") {
        setError("Unsupported file format. Please upload PDF files only.");
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
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-[1.3rem] font-bold text-slate-900">Upload Syllabus</h2>
            <p className="text-slate-500 text-[0.85rem] mt-0.5">Add syllabus material for this class.</p>
          </div>
          <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600 bg-transparent border-none text-2xl leading-none cursor-pointer p-2 rounded-full hover:bg-slate-50 transition-colors">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {success ? (
            <div className="py-12 flex flex-col items-center justify-center text-center animate-fade-in">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mb-4">
                ✓
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Syllabus uploaded successfully</h3>
              <p className="text-slate-500">Redirecting...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 mb-5 text-[0.88rem] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  {error}
                </div>
              )}

              <div className="mb-5">
                <label className="block text-[0.85rem] font-bold text-slate-700 mb-2 uppercase tracking-wide">Title</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 px-4 py-3 rounded-xl text-slate-900 text-[0.95rem] outline-none focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/10 transition-colors"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading}
                  placeholder="e.g. Unit 1 Syllabus"
                  required
                />
              </div>

              <div className="mb-2">
                <label className="block text-[0.85rem] font-bold text-slate-700 mb-2 uppercase tracking-wide">Syllabus File</label>

                {!file ? (
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => !loading && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${isDragging ? "border-[#2563eb] bg-[#2563eb]/5" : "border-slate-300 hover:border-slate-400 bg-slate-50"
                      }`}
                  >
                    <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-slate-400 text-xl mb-3">
                      📄
                    </div>
                    <p className="text-slate-700 font-semibold mb-1">
                      {isDragging ? "Drop file here" : "Choose a file or drag it here"}
                    </p>
                    <p className="text-slate-500 text-[0.8rem]">PDF files only</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 bg-slate-50 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 overflow-hidden">
                      <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center text-xl shrink-0">
                        📄
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-slate-900 font-semibold text-[0.9rem] truncate">{file.name}</p>
                        <p className="text-slate-500 text-[0.75rem]">{file.name.split('.').pop()?.toUpperCase()} • {formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      disabled={loading}
                      className="ml-2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors shrink-0"
                    >
                      ×
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
            </form>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
            <button
              type="button"
              className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 transition-colors"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              type="submit"
              className={`px-6 py-2.5 rounded-lg bg-[#2563eb] text-white font-semibold flex items-center gap-2 transition-colors ${(loading || !title.trim() || !file) ? "opacity-60 cursor-not-allowed" : "hover:bg-[#1d4ed8]"
                }`}
              disabled={loading || !title.trim() || !file}
            >
              {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {loading ? "Uploading..." : "Upload"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
