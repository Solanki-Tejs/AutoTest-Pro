import { getStoredToken } from "./auth";

const API_BASE = "http://localhost:8000/api";

export interface SyllabusItem {
  id: string;
  class_id: number;
  title: string;
  file_ref: string;
  created_at: string;
  status?: string;
  stage?: string;
  error?: string;
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
  if (!token) return [];

  const res = await fetch(`${API_BASE}/classes/${classId}/syllabus`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to fetch syllabus list (${res.status})`);
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
  // Can be used for direct link if we also pass token in query, but fetch is safer for headers
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
