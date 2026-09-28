const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export interface StudentExamAttempt {
  id: string;
  status: "in_progress" | "submitted";
  started_at: string;
  completed_at: string | null;
  deadline: string;
}

export interface StudentExam {
  id: string;
  class_id: number;
  class_name: string;
  title: string;
  total_marks: number;
  duration_minutes: number;
  difficulty: string;
  start_time: string;
  end_time: string;
  status: string;
  attempt: StudentExamAttempt | null;
}

export async function getAllStudentExams(token: string): Promise<StudentExam[]> {
  const res = await fetch(`${BASE_URL}/student/exams`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to fetch student exams");
  }
  return res.json();
}

export async function getExamAttempt(token: string, examId: string) {
  const res = await fetch(`${BASE_URL}/student/exams/${examId}/attempt`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to fetch exam attempt");
  }
  return res.json();
}

export async function getExamPaper(token: string, examId: string) {
  const res = await fetch(`${BASE_URL}/student/exams/${examId}/paper`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to fetch exam paper");
  }
  return res.json();
}

export async function startExamAttempt(token: string, examId: string) {
  const res = await fetch(`${BASE_URL}/student/exams/${examId}/start`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to start exam attempt");
  }
  return res.json();
}

export async function saveAnswers(token: string, examId: string, attemptId: string, answers: any[]) {
  const res = await fetch(`${BASE_URL}/student/exams/${examId}/attempts/${attemptId}/answers`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to save answers");
  }
  return res.json();
}

export async function submitExam(token: string, examId: string, answers: any[]) {
  const res = await fetch(`${BASE_URL}/student/exams/${examId}/submit`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to submit exam");
  }
  return res.json();
}
