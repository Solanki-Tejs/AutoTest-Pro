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
  const [cheatingModal, setCheatingModal] = useState<{ isOpen: boolean; events: any[]; student: string }>({ isOpen: false, events: [], student: "" });
  const [updatingAdj, setUpdatingAdj] = useState<string | null>(null); // attempt id
  
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const availableColumns = [
    { id: "student", label: "Student" },
    { id: "status", label: "Status" },
    { id: "cheating", label: "Cheating Alerts" },
    { id: "eval", label: "Eval Marks" },
    { id: "adjust", label: "Adjust Marks" },
    { id: "total", label: "Total Marks" },
    { id: "result", label: "Result" },
    { id: "date", label: "Submitted At" }
  ];
  const [selectedCols, setSelectedCols] = useState<string[]>(availableColumns.map(c => c.id));

  useEffect(() => {
    fetchAttempts();
  }, [params.examId]);

  const fetchAttempts = () => {
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
  };

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
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateAdjustment = async (attemptId: string, adj: string) => {
    const numAdj = parseFloat(adj);
    if (isNaN(numAdj)) return alert("Invalid number");
    
    setUpdatingAdj(attemptId);
    try {
      const token = getStoredToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/teacher/attempts/${attemptId}/global_marks`, {
        method: "PATCH",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ adjustment: numAdj })
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed to update marks");
      
      // update local state
      setAttempts(prev => prev.map(a => a.id === attemptId ? { ...a, adjustment_marks: numAdj } : a));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingAdj(null);
    }
  };

  const handleDownloadCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    const headers = availableColumns.filter(c => selectedCols.includes(c.id)).map(c => c.label);
    csvContent += headers.join(",") + "\n";

    attempts.forEach(a => {
      const row = [];
      const evalMarks = a.total_marks !== null ? Number(a.total_marks) : 0;
      const adjMarks = a.adjustment_marks !== null ? Number(a.adjustment_marks) : 0;
      const maxMarks = a.max_marks !== null ? Number(a.max_marks) : 0;
      const finalMarks = evalMarks + adjMarks;
      const isPass = maxMarks > 0 && finalMarks >= (0.4 * maxMarks);
      const violationCount = a.cheating_summary?.violation_count || 0;

      if (selectedCols.includes("student")) row.push(`"${a.student_email || `User ${a.student_id}`}"`);
      if (selectedCols.includes("status")) row.push(`"${a.status}"`);
      if (selectedCols.includes("cheating")) row.push(`"${violationCount} Alerts"`);
      if (selectedCols.includes("eval")) row.push(`"${a.total_marks !== null ? `${evalMarks}/${maxMarks}` : '-'}"`);
      if (selectedCols.includes("adjust")) row.push(`"${adjMarks}"`);
      if (selectedCols.includes("total")) row.push(`"${a.status === 'evaluated' ? finalMarks : '-'}"`);
      if (selectedCols.includes("result")) row.push(`"${a.status === 'evaluated' ? (isPass ? 'PASS' : 'FAIL') : '-'}"`);
      if (selectedCols.includes("date")) row.push(`"${a.completed_at ? new Date(a.completed_at).toLocaleString() : '-'}"`);

      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `exam_results_${params.examId}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setShowDownloadModal(false);
  };

  const handleDownloadPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert("Please allow popups to generate PDF");

    const headers = availableColumns.filter(c => selectedCols.includes(c.id)).map(c => c.label);
    let html = `
      <html>
        <head>
          <title>Exam Results</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h2 { color: #334155; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #cbd5e1; padding: 12px; text-align: left; font-size: 14px; }
            th { background-color: #f8fafc; color: #475569; font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>Exam Results</h2>
          <table>
            <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>
    `;

    attempts.forEach(a => {
      const evalMarks = a.total_marks !== null ? Number(a.total_marks) : 0;
      const adjMarks = a.adjustment_marks !== null ? Number(a.adjustment_marks) : 0;
      const maxMarks = a.max_marks !== null ? Number(a.max_marks) : 0;
      const finalMarks = evalMarks + adjMarks;
      const isPass = maxMarks > 0 && finalMarks >= (0.4 * maxMarks);
      const violationCount = a.cheating_summary?.violation_count || 0;

      html += "<tr>";
      if (selectedCols.includes("student")) html += `<td>${a.student_email || `User ${a.student_id}`}</td>`;
      if (selectedCols.includes("status")) html += `<td>${a.status}</td>`;
      if (selectedCols.includes("cheating")) html += `<td>${violationCount} Alerts</td>`;
      if (selectedCols.includes("eval")) html += `<td>${a.total_marks !== null ? `${evalMarks}/${maxMarks}` : '-'}</td>`;
      if (selectedCols.includes("adjust")) html += `<td>${adjMarks}</td>`;
      if (selectedCols.includes("total")) html += `<td>${a.status === 'evaluated' ? finalMarks : '-'}</td>`;
      if (selectedCols.includes("result")) html += `<td>${a.status === 'evaluated' ? (isPass ? 'PASS' : 'FAIL') : '-'}</td>`;
      if (selectedCols.includes("date")) html += `<td>${a.completed_at ? new Date(a.completed_at).toLocaleString() : '-'}</td>`;
      html += "</tr>";
    });

    html += `
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); window.setTimeout(() => window.close(), 500); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setShowDownloadModal(false);
  };

  if (loading) return <div>Loading attempts...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="bg-white p-4 sm:p-6 lg:p-8 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Student Attempts</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDownloadModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-lg shadow-sm transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download
          </button>
          <button
            onClick={handlePublishResults}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-colors"
          >
            Publish Results
          </button>
        </div>
      </div>

      {attempts.length === 0 ? (
        <div className="text-slate-500 text-center py-8">No student attempts found yet.</div>
      ) : (
        <div className="rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[0.7rem] tracking-wider font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Cheating</th>
                <th className="px-4 py-3 text-center">Eval</th>
                <th className="px-4 py-3 text-center">+ / -</th>
                <th className="px-4 py-3 text-center">Total</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attempts.map(a => {
                const evalMarks = a.total_marks !== null ? Number(a.total_marks) : 0;
                const adjMarks = a.adjustment_marks !== null ? Number(a.adjustment_marks) : 0;
                const maxMarks = a.max_marks !== null ? Number(a.max_marks) : 0;
                const finalMarks = evalMarks + adjMarks;
                const isPass = maxMarks > 0 && finalMarks >= (0.4 * maxMarks);
                const violationCount = a.cheating_summary?.violation_count || 0;

                return (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{a.student_email || `User ${a.student_id}`}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[0.7rem] font-bold uppercase tracking-wider ${
                        a.status === 'evaluated' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {violationCount > 0 ? (
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1.5 font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-md text-[0.75rem]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            {violationCount} Alerts
                          </span>
                          <button 
                            onClick={() => setCheatingModal({ isOpen: true, events: a.cheating_summary?.events || [], student: a.student_email })}
                            className="text-[0.75rem] font-bold text-[#2563eb] hover:text-[#1d4ed8] hover:underline transition-colors"
                          >
                            View Details
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-md text-[0.75rem]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                          Clear
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-600">
                      {a.total_marks !== null ? `${evalMarks} / ${maxMarks}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <input 
                          type="number" 
                          step="0.5"
                          defaultValue={adjMarks}
                          onBlur={(e) => {
                            if (e.target.value !== String(adjMarks)) {
                              handleUpdateAdjustment(a.id, e.target.value);
                            }
                          }}
                          disabled={updatingAdj === a.id || a.status !== 'evaluated'}
                          className="w-20 p-1.5 border border-slate-200 bg-slate-50 focus:bg-white rounded-md text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563eb] disabled:opacity-50 transition-all" 
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-[1.1rem] text-slate-900">
                        {a.status === 'evaluated' ? `${finalMarks}` : '-'}
                      </span>
                      {a.status === 'evaluated' && <span className="text-slate-500 text-[0.8rem] ml-1">/ {maxMarks}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {a.status === 'evaluated' ? (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[0.75rem] font-bold uppercase tracking-wider ${isPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {isPass ? 'PASS' : 'FAIL'}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-[0.85rem] font-medium">
                      {a.completed_at ? new Date(a.completed_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => router.push(`/teacher/exams/${params.examId}/results/${a.id}`)}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.8rem] font-bold transition-colors ${
                          a.status === 'evaluated' 
                            ? 'bg-[#2563eb]/10 text-[#2563eb] hover:bg-[#2563eb]/20' 
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                        disabled={a.status !== 'evaluated'}
                      >
                        {a.status === 'evaluated' ? 'Review' : 'Pending'}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cheating Detection Modal */}
      {cheatingModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-900">Cheating Detection: {cheatingModal.student}</h3>
              <button onClick={() => setCheatingModal({ isOpen: false, events: [], student: "" })} className="text-slate-400 hover:text-slate-600">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2">
              {cheatingModal.events.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No violations detected for this attempt.</div>
              ) : (
                <div className="space-y-4">
                  {cheatingModal.events.map((ev, idx) => (
                    <div key={idx} className="p-4 rounded-xl border border-red-100 bg-red-50 flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-red-700 bg-red-200 px-2 py-1 rounded text-xs">{ev.eventType}</span>
                        <span className="text-xs text-red-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm text-red-900">{ev.details?.description}</p>
                      {ev.details?.snapshot_url && (
                        <div className="mt-2">
                           <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${ev.details.snapshot_url}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View Snapshot</a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Download Results</h3>
              <button onClick={() => setShowDownloadModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <p className="text-sm text-slate-600 mb-4 font-medium">Select columns to include:</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {availableColumns.map(col => (
                <label key={col.id} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox"
                    checked={selectedCols.includes(col.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedCols([...selectedCols, col.id]);
                      else setSelectedCols(selectedCols.filter(id => id !== col.id));
                    }}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-sm text-slate-700 font-medium group-hover:text-slate-900">{col.label}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={handleDownloadCSV}
                disabled={selectedCols.length === 0}
                className="flex-1 flex justify-center items-center gap-2 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl border border-emerald-200 transition-colors disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                Excel (CSV)
              </button>
              <button 
                onClick={handleDownloadPDF}
                disabled={selectedCols.length === 0}
                className="flex-1 flex justify-center items-center gap-2 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-200 transition-colors disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
