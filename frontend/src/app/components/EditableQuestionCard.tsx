"use client";

import { useState } from "react";
import { Question, Option } from "@/app/lib/exams";
import { toast } from "sonner";
import Badge from "@/app/components/Badge";

export default function EditableQuestionCard({
  question,
  onSave,
  onRegenerate,
  onDelete,
  isRegenerating = false,
  disabled = false
}: {
  question: Question;
  onSave: (updates: Partial<Question>) => Promise<void>;
  onRegenerate: () => void;
  onDelete: () => void;
  isRegenerating?: boolean;
  disabled?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit State
  const [text, setText] = useState(question.question_text);
  const [bloom, setBloom] = useState(question.bloom_level);
  const [mark, setMark] = useState(question.mark);
  const [options, setOptions] = useState<Option[]>(question.options || []);
  const [correctAnswer, setCorrectAnswer] = useState(question.correct_answer || "");

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
      toast.success("Question updated");
      setIsEditing(false);
    } catch (e) {
      toast.error("Failed to save changes");
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
      <div className="bg-surface border border-teacher/40 rounded-xl p-6 mb-4 shadow-sm animate-fade-up">
        <div className="flex justify-between items-center mb-4">
          <span className="font-mono text-sm font-bold text-graphite">Q{question.order + 1}</span>
          <Badge variant="teacher">Editing Question</Badge>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-mono font-semibold uppercase tracking-wider text-graphite/70 mb-1">
            Question Statement
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full p-3 font-serif text-base border border-grid rounded-md focus:border-teacher focus:ring-1 focus:ring-teacher outline-none min-h-[100px] bg-paper"
          />
        </div>

        {options.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs font-mono font-semibold uppercase tracking-wider text-graphite/70 mb-2">
              Options
            </label>
            <div className="flex flex-col gap-2">
              {options.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-graphite/60 w-6">
                    ({String.fromCharCode(97 + idx)})
                  </span>
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => {
                      const newOpts = [...options];
                      newOpts[idx].text = e.target.value;
                      setOptions(newOpts);
                    }}
                    className="flex-1 p-2 font-serif text-sm border border-grid rounded-md focus:border-teacher outline-none bg-paper"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-grid">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-4 py-2 font-mono text-xs uppercase tracking-wider text-graphite/60 hover:text-graphite rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 font-mono text-xs uppercase tracking-wider bg-teacher text-white rounded-md font-semibold hover:bg-teacher/90 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative group break-inside-avoid ${isRegenerating ? "opacity-50" : ""}`}>
      {isRegenerating && (
        <div className="absolute inset-0 bg-surface/60 flex items-center justify-center z-10 backdrop-blur-xs">
          <div className="w-6 h-6 border-2 border-grid border-t-teacher rounded-full animate-spin" />
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <span className="font-serif font-bold text-lg min-w-[24px] mt-0.5">
            {question.order + 1}.
          </span>
          <div className="flex-1">
            <p className="font-serif text-[1.05rem] leading-relaxed whitespace-pre-wrap text-graphite">
              {question.question_text}
            </p>
            {question.options && question.options.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-4 font-serif">
                {question.options.map((opt, i) => (
                  <div key={opt.id} className="flex items-start gap-2">
                    <span className="w-6 text-[1rem] text-graphite/70">
                      ({String.fromCharCode(97 + i)})
                    </span>
                    <span
                      className={`text-[1rem] ${
                        question.correct_answer === opt.id ? "font-bold text-teacher" : "text-graphite"
                      }`}
                    >
                      {opt.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ml-4 font-mono font-bold text-sm whitespace-nowrap mt-0.5 text-graphite/80">
          [{question.mark} {question.mark === 1 ? "Mark" : "Marks"}]
        </div>
      </div>

      {!disabled && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-4 mt-3 ml-9 font-mono text-[0.72rem] tracking-wider uppercase">
          <button
            onClick={() => setIsEditing(true)}
            className="text-graphite/50 hover:text-teacher transition-colors"
          >
            [ Edit ]
          </button>
          <button
            onClick={() => {
              toast.promise(Promise.resolve(onRegenerate()), {
                loading: "Regenerating question...",
                success: "Question regenerated",
                error: "Failed to regenerate"
              });
            }}
            className="text-graphite/50 hover:text-teacher transition-colors"
          >
            [ Regenerate ]
          </button>
          <button
            onClick={() => {
              if (confirm("Delete this question from the paper?")) {
                onDelete();
                toast.success("Question deleted");
              }
            }}
            className="text-graphite/50 hover:text-rose-600 transition-colors"
          >
            [ Delete ]
          </button>
        </div>
      )}
    </div>
  );
}
