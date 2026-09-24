import { useState } from "react";
import { Question, Answer } from "../lib/exams";

interface Props {
  question: Question;
  answer?: Answer;
  isRegenerating: boolean;
  onSave: (updates: Partial<Answer>) => Promise<void>;
  onRegenerate: () => Promise<void>;
}

export default function EditableAnswerCard({ question, answer, isRegenerating, onSave, onRegenerate }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(answer?.answer_text || "");
  const [editedKey, setEditedKey] = useState(answer?.answer_key || "");
  
  const handleSave = async () => {
    await onSave({ answer_text: editedText, answer_key: editedKey });
    setIsEditing(false);
  };

  const handleRegenerate = async () => {
    if (answer?.is_edited) {
      if (!confirm("This answer has been manually edited.\nRegenerating it will replace your changes.\n\nContinue?")) {
        return;
      }
    }
    await onRegenerate();
  };
  
  const isStale = answer?.is_stale;
  
  return (
    <div className={`p-6 border rounded-lg transition-all ${isStale ? 'border-amber-300 bg-amber-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <div className="mb-4">
        <span className="font-bold mr-2 text-slate-800">Q.</span>
        <span className="text-slate-900 font-medium">{question.question_text}</span>
      </div>
      
      {question.type === "mcq" && question.options && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {question.options.map((opt) => (
            <div key={opt.id} className="flex items-center gap-3 p-3 rounded-md border border-slate-200 bg-slate-50/50">
              <span className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 text-slate-500 font-bold rounded text-xs shadow-sm">{opt.id}</span>
              <span className="text-[0.95rem] text-slate-700">{opt.text}</span>
            </div>
          ))}
        </div>
      )}
      
      <div className="border-t border-slate-100 pt-5 mt-4">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-bold text-[#16a34a] flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Official Answer
            {answer?.is_edited && <span className="text-[0.7rem] uppercase tracking-wider font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-sm">Edited</span>}
            {isStale && <span className="text-[0.7rem] uppercase tracking-wider font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-sm">Stale</span>}
          </h4>
          {!isEditing && answer && (
            <div className="flex gap-3">
              <button onClick={() => setIsEditing(true)} className="text-sm font-semibold text-[#2563eb] hover:text-blue-800 transition-colors flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                Edit
              </button>
              <button onClick={handleRegenerate} disabled={isRegenerating} className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isRegenerating ? "animate-spin" : ""}><path d="M21.5 2v6h-6M2.13 15.57a9 9 0 1 0 3.84-10.36L2 2"/></svg>
                {isRegenerating ? "Regenerating..." : "Regenerate"}
              </button>
            </div>
          )}
        </div>
        
        {!answer ? (
          <div className="text-slate-500 italic text-sm py-2 px-4 bg-slate-50 rounded border border-slate-100">No answer generated for this question.</div>
        ) : isEditing ? (
          <div className="flex flex-col gap-4 animate-fade-in bg-blue-50/30 p-4 rounded-lg border border-blue-100">
            {question.type === "mcq" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Correct Option ID</label>
                <input type="text" value={editedKey} onChange={(e) => setEditedKey(e.target.value)} className="w-24 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono" placeholder="e.g. A" />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Answer Text / Explanation</label>
              <textarea value={editedText} onChange={(e) => setEditedText(e.target.value)} rows={4} className="w-full p-3 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-y text-[0.95rem] leading-relaxed" placeholder="Enter the official answer text..." />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} className="px-5 py-2 bg-[#2563eb] hover:bg-blue-700 text-white rounded-md font-semibold text-sm transition-colors shadow-sm">Save Changes</button>
              <button onClick={() => { setIsEditing(false); setEditedText(answer.answer_text); setEditedKey(answer.answer_key || ""); }} className="px-5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md font-semibold text-sm transition-colors shadow-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="bg-green-50/50 p-4 rounded-lg border border-green-100/50">
            {question.type === "mcq" && answer.answer_key && (
              <div className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <span className="text-sm text-slate-500 uppercase tracking-wide">Correct Option:</span> 
                <span className="bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">{answer.answer_key}</span>
              </div>
            )}
            <div className="text-slate-800 whitespace-pre-wrap leading-relaxed text-[0.95rem]">{answer.answer_text}</div>
          </div>
        )}
      </div>
    </div>
  );
}
