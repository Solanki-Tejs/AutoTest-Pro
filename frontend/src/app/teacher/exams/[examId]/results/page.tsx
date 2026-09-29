"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "@/app/lib/auth";

export default function ExamResultsPage(props: { params: Promise<{ examId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/teacher/exams/${params.examId}/attempts`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(async (res) => {
      if (!res.ok) throw new Error((await res.json()).detail || "Failed to fetch attempts");
      return res.json();
    })
    .then(data => {
      setAttempts(data);
    })
    .catch(e => setError(e.message))
    .finally(() => setLoading(false));
  }, [params.examId]);

  if (loading) return <div>Loading attempts...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  const handlePublishResults = async () => {
    if (!confirm("Are you sure you want to publish results for all evaluated attempts? Students will be able to see their marks.")) return;
    try {
      const token = getStoredToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/teacher/exams/${params.examId}/results/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed to publish results");
      alert("Results published successfully!");
      // Option: refresh the list to show publication status if we had it in the response
    } catch(err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Student Attempts</h2>
        <button 
          onClick={handlePublishResults}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-colors"
        >
          Publish Results
        </button>
      </div>
      
      {attempts.length === 0 ? (
        <div className="text-slate-500 text-center py-8">No student attempts found yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="p-4">Student</th>
                <th className="p-4">Status</th>
                <th className="p-4">Marks</th>
                <th className="p-4">Submitted At</th>
                <th className="p-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attempts.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-medium text-slate-900">{a.student_email || `User ${a.student_id}`}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                      a.status === 'evaluated' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-slate-700">
                    {a.total_marks !== null ? `${a.total_marks} / ${a.max_marks}` : '-'}
                  </td>
                  <td className="p-4 text-slate-500">
                    {a.completed_at ? new Date(a.completed_at).toLocaleString() : '-'}
                  </td>
                  <td className="p-4">
                    <button 
                      onClick={() => router.push(`/teacher/exams/${params.examId}/results/${a.id}`)}
                      className="text-[#6c63ff] hover:text-[#5a52d5] font-semibold text-sm transition-colors"
                      disabled={a.status !== 'evaluated'}
                    >
                      {a.status === 'evaluated' ? 'Review & Override' : 'Pending'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
