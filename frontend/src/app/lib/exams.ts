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
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load exams");
  return res.json();
}

export async function updateExam(
  token: string,
  examId: string,
  data: Partial<{
    title: string;
    class_id: number;
    total_marks: number;
    duration_minutes: number;
    difficulty: string;
    selected_pdf_ids: string[];
    start_time: string | null;
    end_time: string | null;
    status: string;
  }>
) {
  const res = await fetch(`${BASE_URL}/exams/${examId}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to update exam");
  }
  return res.json();
}

export async function getExam(token: string, examId: string): Promise<Exam> {
  const res = await fetch(`${BASE_URL}/exams/${examId}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch exam");
  }
  return res.json();
}

export async function getStudentExams(token: string, classId: number): Promise<Exam[]> {
  const res = await fetch(`${BASE_URL}/classes/${classId}/student/exams`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load exams");
  return res.json();
}

export async function deleteExam(token: string, examId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/exams/${examId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to delete exam");
  }
}


export async function getAvailableSyllabuses(token: string): Promise<SyllabusAvailable[]> {
  const res = await fetch(`${BASE_URL}/syllabus/available-for-exam`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch available syllabuses");
  }
  return res.json();
}

export async function getExamBlueprint(token: string, examId: string): Promise<Blueprint> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/blueprint`, {
    headers: authHeaders(token),
    cache: "no-store",
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

// ── Question Bank / Paper Generation ──────────────────────────────────────────

export interface Option {
  id: string;
  text: string;
}

export interface Question {
  question_id: string;
  question_text: string;
  type: string;
  bloom_level: string;
  mark: number;
  order: number;
  options?: Option[];
  correct_answer?: string;
  source_chunk_ids?: string[];
  is_edited: boolean;
  is_regenerated: boolean;
}

export interface PaperSection {
  sectionNo: string;
  sectionName: string;
  questions: Question[];
}

export interface QuestionBank {
  _id: string;
  exam_id: string;
  version: number;
  status: string;
  is_active: boolean;
  question_body: {
    sections: PaperSection[];
  };
  generation?: {
    method: string;
    model: string;
    generated_at: string;
  };
  created_at: string;
  updated_at: string;
}

export interface GenerationStatus {
  exam_id: string;
  status: string;
  progress?: number;
  current_section?: string;
}

export async function generatePaper(token: string, examId: string): Promise<GenerationStatus> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/generate`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to start generation");
  }
  return res.json();
}

export async function getGenerationStatus(token: string, examId: string): Promise<GenerationStatus> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/generation-status`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to fetch status");
  }
  return res.json();
}

export async function getQuestionBank(token: string, examId: string): Promise<QuestionBank> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/question-bank`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Question bank not found");
  }
  return res.json();
}

export async function approveQuestionBank(token: string, examId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/question-bank/approve`, {
    method: "PUT",
    headers: authHeaders(token)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to approve");
  }
}

export async function editQuestion(token: string, examId: string, questionId: string, updates: Partial<Question>): Promise<void> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/questions/${questionId}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to edit question");
  }
}

export async function regenerateQuestion(token: string, examId: string, questionId: string): Promise<Question> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/questions/${questionId}/regenerate`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to regenerate question");
  }
  return res.json();
}

export async function deleteQuestion(token: string, examId: string, questionId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/questions/${questionId}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to delete question");
  }
}

// ── Answers ─────────────────────────────────────────────────────────

export interface Answer {
  answer_id: string;
  question_id: string;
  answer_key?: string;
  answer_text: string;
  answer_type: string;
  is_edited: boolean;
  is_approved: boolean;
  is_stale?: boolean;
}

export interface AnswerBank {
  _id: string;
  exam_id: string;
  question_bank_id: string;
  question_bank_version: number;
  answer_body: Answer[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AnswerGenerationStatus {
  exam_id: string;
  status: string;
  total_questions: number;
  generated_questions: number;
  failed_questions: number;
  progress: number;
}

export async function generateAnswers(token: string, examId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/answers/generate`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!res.ok) throw new Error("Failed to start answer generation");
}

export async function getAnswerGenerationStatus(token: string, examId: string): Promise<AnswerGenerationStatus> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/answers/status`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  if (!res.ok) throw new Error("Failed to fetch answer generation status");
  return res.json();
}

export async function getAnswerBank(token: string, examId: string): Promise<AnswerBank> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/answers`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  if (!res.ok) throw new Error("Answer bank not found");
  return res.json();
}

export async function editAnswer(token: string, examId: string, answerId: string, updates: Partial<Answer>): Promise<void> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/answers/${answerId}`, {
    method: "PATCH",
    headers: { ...authHeaders(token) },
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error("Failed to edit answer");
}

export async function regenerateAnswer(token: string, examId: string, answerId: string): Promise<Answer> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/answers/${answerId}/regenerate`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!res.ok) throw new Error("Failed to regenerate answer");
  return res.json();
}

export async function regenerateAllAnswers(token: string, examId: string, mode: "all" | "unedited" = "unedited"): Promise<void> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/answers/regenerate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ mode })
  });
  if (!res.ok) throw new Error("Failed to regenerate answers");
}

export async function approveAnswerBank(token: string, examId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/exams/${examId}/answers/approve`, {
    method: "POST",
    headers: authHeaders(token)
  });
  if (!res.ok) throw new Error("Failed to approve answer bank");
}
