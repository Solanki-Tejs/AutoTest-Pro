/**
 * AutoTest Pro — Class Management API helpers
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export interface ClassItem {
  id: number;
  name: string;
  description: string | null;
  teacher_id: number;
  teacher_name: string;
  join_code: string;
  student_count: number;
  created_at: string;
}

export interface EnrolledStudent {
  enrollment_id: number;
  student_id: number;
  student_name: string;
  student_email: string;
  status: string;
  joined_at: string;
}

export interface ClassPreview {
  id: number;
  name: string;
  description: string | null;
  join_code: string;
  teacher_name: string;
  student_count: number;
}

export interface JoinRequest {
  id: number;
  class_id: number;
  class_name: string;
  student_id: number;
  student_name: string;
  student_email: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface Membership {
  id: number;
  class_id: number;
  class_name: string;
  class_description: string | null;
  teacher_name: string;
  status: "pending" | "approved" | "rejected";
  joined_at: string;
}

// ─── Teacher ──────────────────────────────────────────────────────────────────

export async function createClass(
  token: string,
  name: string,
  description: string
): Promise<ClassItem> {
  const res = await fetch(`${BASE_URL}/api/classes/`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Failed to create class");
  return res.json();
}

export async function fetchMyClasses(token: string): Promise<ClassItem[]> {
  const res = await fetch(`${BASE_URL}/api/classes/my`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch classes");
  return res.json();
}

export async function fetchAllRequests(token: string): Promise<JoinRequest[]> {
  const res = await fetch(`${BASE_URL}/api/classes/requests`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch requests");
  return res.json();
}

export async function approveRequest(token: string, requestId: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/classes/requests/${requestId}/approve`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to approve");
}

export async function rejectRequest(token: string, requestId: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/classes/requests/${requestId}/reject`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to reject");
}

export async function deleteClass(token: string, classId: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/classes/${classId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to delete class");
}

export async function fetchClassStudents(
  token: string,
  classId: number
): Promise<EnrolledStudent[]> {
  const res = await fetch(`${BASE_URL}/api/classes/${classId}/students`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch students");
  return res.json();
}

export async function removeStudentFromClass(
  token: string,
  classId: number,
  studentId: number
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/classes/${classId}/students/${studentId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to remove student");
}

// ─── Student ──────────────────────────────────────────────────────────────────

export async function previewClassByCode(
  token: string,
  code: string
): Promise<ClassPreview> {
  const res = await fetch(`${BASE_URL}/api/classes/preview/${code.trim().toUpperCase()}`, {
    headers: authHeaders(token),
  });
  if (res.status === 404) throw new Error("Invalid class code. Please check and try again.");
  if (!res.ok) throw new Error("Failed to look up class");
  return res.json();
}

export async function requestToJoinByCode(token: string, code: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/classes/join/${code.trim().toUpperCase()}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (res.status === 409) {
    const data = await res.json();
    throw new Error(data.detail ?? "Already requested");
  }
  if (res.status === 404) throw new Error("Invalid class code");
  if (!res.ok) throw new Error("Failed to send join request");
}

export async function fetchMyMemberships(token: string): Promise<Membership[]> {
  const res = await fetch(`${BASE_URL}/api/classes/my-memberships`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch memberships");
  return res.json();
}
