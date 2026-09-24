"use client";

import { useState } from "react";
import { Question, Option } from "@/app/lib/exams";

export default function EditableQuestionCard({
  question,
  onSave,
  onRegenerate,
  onDelete,
  isRegenerating = false
}: {
  question: Question;
  onSave: (updates: Partial<Question>) => Promise<void>;
  onRegenerate: () => void;
  onDelete: () => void;
  isRegenerating?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Edit State
  const [text, setText] = useState(question.question_text);
  const [bloom, setBloom] = useState(question.bloom_level);
  const [mark, setMark] = useState(question.mark);
  const [options, setOptions] = useState<Option[]>(question.options || []);
  const [correctAnswer, setCorrectAnswer] = useState(question.correct_answer || "");

  const bloomLevels = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        question_text: text,
        bloom_level: bloom,
        mark: mark,
        options: options.length > 0 ? options : undefined,
        correct_answer: correctAnswer || undefined
      });
      setIsEditing(false);
    } catch (e) {
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setText(question.question_text);
    setBloom(question.bloom_level);
    setMark(question.mark);
    setOptions(question.options || []);
    setCorrectAnswer(question.correct_answer || "");
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-[#2563eb] rounded-xl p-6 mb-4 shadow-sm animate-fade-up">
        <div className="flex justify-between items-center mb-4">
          <span className="font-bold text-slate-900 text-lg">Q{question.order + 1}</span>
          <span className="text-xs font-semibold bg-[#2563eb]/10 text-[#2563eb] px-2 py-1 rounded-full uppercase">Editing</span>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-1">Question Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full p-3 border border-slate-300 rounded-md focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none min-h-[100px]"
          />
        </div>

        {options.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Options</label>
            <div className="flex flex-col gap-2">
              {options.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-3">
                  <span className="font-bold text-slate-500 w-5">{opt.id}.</span>
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => {
                      const newOpts = [...options];
                      newOpts[idx].text = e.target.value;
                      setOptions(newOpts);
                    }}
                    className="flex-1 p-2 border border-slate-300 rounded-md focus:border-[#2563eb] outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        )}



        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button onClick={handleCancel} disabled={saving} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md font-semibold transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-[#2563eb] text-white rounded-md font-semibold hover:bg-[#1d4ed8] transition-colors">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative group break-inside-avoid ${isRegenerating ? 'opacity-50' : ''}`}>
      {isRegenerating && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-black rounded-full animate-spin" />
        </div>
      )}
      
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <span className="font-bold text-lg min-w-[24px] mt-0.5">{question.order + 1}.</span>
          <div className="flex-1">
            <p className="text-[1.05rem] leading-relaxed whitespace-pre-wrap">
              {question.question_text}
            </p>
            {question.options && question.options.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-4">
                {question.options.map((opt, i) => (
                  <div key={opt.id} className="flex items-start gap-2">
                    <span className="w-6 text-[1rem]">({String.fromCharCode(97 + i)})</span>
                    <span className={`text-[1rem] ${question.correct_answer === opt.id ? 'font-bold' : ''}`}>{opt.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="ml-4 font-bold text-lg whitespace-nowrap mt-0.5">
          [{question.mark}]
        </div>
      </div>

      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-4 mt-2 ml-9">
        <button onClick={() => setIsEditing(true)} className="text-xs font-semibold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wider">
          Edit
        </button>
        <button onClick={() => { if(confirm("Regenerate this question?")) onRegenerate(); }} className="text-xs font-semibold text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-wider">
          Regenerate
        </button>
      </div>
    </div>
  );
}
