import { getStoredToken } from "./auth";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_BASE = RAW_BASE.replace(/\/+$/, "").endsWith("/api")
  ? RAW_BASE.replace(/\/+$/, "")
  : `${RAW_BASE.replace(/\/+$/, "")}/api`;


export interface SyllabusItem {
  id: string;
  class_id: number;
  title: string;
  file_ref: string;
  created_at: string;
  status: string;
  processing_stage?: string | null;
  error_message?: string | null;
}

export interface SyllabusStatus {
  id: string;
  status: string;
  stage?: string | null;
  progress: number;
  error_message?: string | null;
  updated_at?: string | null;
}

export async function uploadSyllabus(
  classId: number,
  title: string,
  file: File
): Promise<SyllabusItem> {
  const token = getStoredToken();
  if (!token) throw new Error("No auth token");

  const formData = new FormData();
  formData.append("title", title);
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/classes/${classId}/syllabus`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to upload syllabus");
  }

  return res.json();
}

export async function fetchSyllabusList(classId: number): Promise<SyllabusItem[]> {
  const token = getStoredToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${API_BASE}/classes/${classId}/syllabus`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch syllabus list");
  }

  return res.json();
}

export async function fetchSyllabusStatus(syllabusId: string): Promise<SyllabusStatus> {
  const token = getStoredToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${API_BASE}/syllabus/${syllabusId}/status`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch syllabus status");
  }

  return res.json();
}

export async function retrySyllabus(syllabusId: string): Promise<SyllabusItem> {
  const token = getStoredToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${API_BASE}/syllabus/${syllabusId}/retry`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to retry syllabus ingestion");
  }

  return res.json();
}

export async function deleteSyllabus(syllabusId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${API_BASE}/syllabus/${syllabusId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to delete syllabus");
  }
}

export function getDownloadUrl(syllabusId: string, download: boolean = false): string {
  return `${API_BASE}/syllabus/${syllabusId}/file?download=${download}`;
}

export async function downloadSyllabus(syllabusId: string, title: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(getDownloadUrl(syllabusId, true), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to download syllabus");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = title;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function viewSyllabus(syllabusId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(getDownloadUrl(syllabusId, false), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to open syllabus");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(
    new Blob([blob], { type: "application/pdf" })
  );
  window.open(url, "_blank");
}
