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
                  <input
                    type="radio"
                    name={`correct-${question.question_id}`}
                    checked={correctAnswer === opt.id}
                    onChange={() => setCorrectAnswer(opt.id)}
                    className="w-4 h-4 text-[#2563eb]"
                  />
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

        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Bloom Level</label>
            <select
              value={bloom}
              onChange={(e) => setBloom(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-md outline-none"
            >
              {bloomLevels.map(bl => <option key={bl} value={bl}>{bl}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Marks</label>
            <input
              type="number"
              value={mark}
              onChange={(e) => setMark(parseInt(e.target.value) || 1)}
              className="w-full p-2 border border-slate-300 rounded-md outline-none"
            />
          </div>
        </div>

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
    <div className={`bg-white border border-slate-200 rounded-xl p-6 mb-4 hover:border-slate-300 transition-colors relative ${isRegenerating ? 'opacity-50' : ''}`}>
      {isRegenerating && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 rounded-xl backdrop-blur-[1px]">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-[#2563eb] rounded-full animate-spin" />
        </div>
      )}
      
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-900 text-lg">Q{question.order + 1}.</span>
          {question.is_edited && <span className="text-[0.7rem] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase">Edited</span>}
          {question.is_regenerated && <span className="text-[0.7rem] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold uppercase">Regenerated</span>}
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500 font-semibold">
          <span className="bg-slate-100 px-2 py-0.5 rounded">{question.bloom_level}</span>
          <span className="bg-slate-100 px-2 py-0.5 rounded">{question.mark} Marks</span>
        </div>
      </div>
      
      <p className="text-slate-800 text-[1rem] leading-relaxed mb-4 whitespace-pre-wrap">
        {question.question_text}
      </p>

      {question.options && question.options.length > 0 && (
        <div className="flex flex-col gap-2 mb-6 ml-2">
          {question.options.map(opt => (
            <div key={opt.id} className="flex items-start gap-2">
              <span className={`font-bold w-5 ${question.correct_answer === opt.id ? 'text-green-600' : 'text-slate-500'}`}>{opt.id}.</span>
              <span className={question.correct_answer === opt.id ? 'text-green-700 font-medium' : 'text-slate-700'}>{opt.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-4 border-t border-slate-100 mt-2">
        <button onClick={() => setIsEditing(true)} className="px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded border border-slate-200 transition-colors">
          Edit
        </button>
        <button onClick={() => { if(confirm("Regenerate this question?")) onRegenerate(); }} className="px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-100 transition-colors">
          Regenerate
        </button>
        <button onClick={() => { if(confirm("Delete this question?")) onDelete(); }} className="px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded border border-red-100 transition-colors ml-auto">
          Delete
        </button>
      </div>
    </div>
  );
}
