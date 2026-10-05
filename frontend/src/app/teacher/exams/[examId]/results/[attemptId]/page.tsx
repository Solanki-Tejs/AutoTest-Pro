"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "@/app/lib/auth";

export default function AttemptReviewPage(props: { params: Promise<{ examId: string, attemptId: string }> }) {
  const params = use(props.params);
  const router = useRouter();

  const [answers, setAnswers] = useState<any[]>([]);
  const [totalMarks, setTotalMarks] = useState<number | null>(null);
  const [maxMarks, setMaxMarks] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [overrideMarks, setOverrideMarks] = useState<number>(0);
  const [overrideReason, setOverrideReason] = useState("");

  const token = getStoredToken();
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

  const fetchAttempt = () => {
    fetch(`${BASE_URL}/teacher/attempts/${params.attemptId}/evaluation`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).detail || "Failed to fetch evaluation");
        return res.json();
      })
      .then(data => {
        setAnswers(data.answers || []);
        setTotalMarks(data.total_marks);
        setMaxMarks(data.max_marks);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) return;
    fetchAttempt();
  }, [params.attemptId, token]);

  const handleOverride = async (qId: string) => {
    if (!overrideReason) {
      alert("Reason is required");
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/teacher/attempts/${params.attemptId}/questions/${qId}/marks`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ marks: overrideMarks, reason: overrideReason })
      });

      if (!res.ok) {
        throw new Error((await res.json()).detail);
      }

      setEditingId(null);
      fetchAttempt(); // reload
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleApprove = async () => {
    try {
      const res = await fetch(`${BASE_URL}/teacher/attempts/${params.attemptId}/review/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      router.push(`/teacher/exams/${params.examId}/results`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Review Evaluation</h2>
          {totalMarks !== null && maxMarks !== null && (
            <p className="text-lg text-slate-600 mt-1">
              Total Score: <span className="font-bold text-purple-700">{totalMarks} / {maxMarks}</span>
            </p>
          )}
        </div>
        <button onClick={handleApprove} className="px-6 py-2.5 bg-[#6c63ff] text-white font-bold rounded-lg shadow-sm">
          Approve Results
        </button>
      </div>

      <div className="space-y-6">
        {answers.map((ans, idx) => {
          const evalData = ans.evaluation || {};
          const isEditing = editingId === ans.question_id;

          return (
            <div key={idx} className="p-6 rounded-xl border border-slate-200 bg-slate-50 space-y-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="font-bold text-slate-800 text-lg">
                    {ans.question_text || `QID: ${ans.question_id}`}
                  </div>
                  {ans.question_text && (
                    <div className="text-xs text-slate-400 font-mono mt-1">QID: {ans.question_id}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-slate-900">
                    Marks: {evalData.modified_by_teacher ? evalData.teacher_override_marks : evalData.ai_assigned_marks} {ans.max_marks ? `/ ${ans.max_marks}` : ''}
                  </div>
                  {evalData.modified_by_teacher && (
                    <div className="text-xs text-purple-600 font-bold uppercase mt-1">Teacher Overridden</div>
                  )}
                </div>
              </div>

              <div className="text-sm bg-white p-4 rounded border border-slate-200">
                <strong>Student Answer:</strong> {JSON.stringify(ans.answer)}
              </div>

              <div className="text-sm bg-blue-50/50 p-4 rounded border border-blue-100">
                <strong>AI Feedback:</strong> {evalData.ai_feedback}
                <div className="mt-2 text-slate-500 italic text-xs">
                  Justification: {evalData.ai_justification} (Confidence: {evalData.ai_confidence_level})
                </div>
              </div>

              {evalData.modified_by_teacher && (
                <div className="text-sm bg-purple-50 p-4 rounded border border-purple-200">
                  <strong>Override Reason:</strong> {evalData.override_reason}
                </div>
              )}

              {isEditing ? (
                <div className="p-4 bg-white border border-slate-300 rounded-lg space-y-3 mt-4 shadow-sm">
                  <h4 className="font-bold text-slate-800">Override Marks</h4>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      value={overrideMarks}
                      onChange={(e) => setOverrideMarks(parseFloat(e.target.value))}
                      className="border p-2 rounded w-24 outline-none focus:border-[#6c63ff]"
                      placeholder="Marks"
                    />
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="border p-2 rounded flex-1 outline-none focus:border-[#6c63ff]"
                      placeholder="Required reason for override"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded">Cancel</button>
                    <button onClick={() => handleOverride(ans.question_id)} className="px-4 py-2 bg-purple-600 text-white font-bold rounded">Save Override</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingId(ans.question_id);
                    setOverrideMarks(evalData.modified_by_teacher ? evalData.teacher_override_marks : evalData.ai_assigned_marks);
                    setOverrideReason(evalData.override_reason || "");
                  }}
                  className="mt-4 px-4 py-2 text-purple-700 bg-purple-50 hover:bg-purple-100 font-bold text-sm rounded-lg transition-colors border border-purple-200"
                >
                  Override Marks
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
