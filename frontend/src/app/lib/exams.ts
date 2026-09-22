const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export interface Exam {
  id: string;
  class_id: number;
  class_name?: string;
  title: string;
  total_marks: number;
  duration_minutes: number;
  difficulty: string;
  selected_pdf_ids: string[];
  start_time?: string;
  end_time?: string;
  status: string;
  created_at: string;
}

export interface SyllabusAvailable {
  id: string;
  class_id: number;
  title: string;
  file_ref: string;
  status: string;
  stage: string;
  created_at: string;
}

export interface Section {
  section_id?: string;
  section: string;
  type: string;
  count: number;
  marks_each: number;
  order?: number;
  total_marks?: number;
}

export interface Blueprint {
  exam_id: string;
  total_marks: number;
  sections: Section[];
}

export async function createExam(
  token: string,
  data: {
    class_id: number;
    title: string;
    total_marks: number;
    duration_minutes: number;
    difficulty: string;
    selected_pdf_ids: string[];
    start_time?: string;
    end_time?: string;
  }
) {
  const res = await fetch(`${BASE_URL}/exams`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to create exam");
  }
  return res.json();
}

export async function getTeacherExams(token: string): Promise<Exam[]> {
  const res = await fetch(`${BASE_URL}/exams`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error("Failed to fetch exams");
  }
  return res.json();
}

export async function getExam(token: string, examId: string): Promise<Exam> {
  const res = await fetch(`${BASE_URL}/exams/${examId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error("Failed to fetch exam");
  }
  return res.json();
}

export async function getAvailableSyllabuses(token: string): Promise<SyllabusAvailable[]> {
  const res = await fetch(`${BASE_URL}/syllabus/available-for-exam`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error("Failed to fetch available syllabuses");
  }
  return res.json();
}

export async function getExamBlueprint(token: string, examId: string): Promise<Blueprint> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/blueprint`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    if (res.status === 404) return { exam_id: examId, total_marks: 0, sections: [] };
    throw new Error("Failed to fetch blueprint");
  }
  return res.json();
}

export async function saveExamBlueprint(
  token: string,
  examId: string,
  sections: Section[]
): Promise<Blueprint> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/blueprint`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ sections }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to save blueprint");
  }
  return res.json();
}
