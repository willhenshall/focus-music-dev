import { useState, useEffect, useRef } from 'react';
import { Edit2, Save, X, Plus, Trash2, Settings, FileJson, Download, FileUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

type QuizQuestion = {
  id: string;
  question_order: number;
  question_type: 'single_select' | 'likert_1_5' | 'likert_1_7';
  question_text: string;
  options: Array<{ value: string; label: string }>;
  reverse_scored: boolean;
};

type QuizConfig = {
  id: string;
  version: string;
  scoring_logic: any;
  channel_mapping: any;
  is_active: boolean;
};

export function QuizManager() {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [config, setConfig] = useState<QuizConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editedQuestion, setEditedQuestion] = useState<Partial<QuizQuestion>>({});
  const [activeTab, setActiveTab] = useState<'questions' | 'algorithm'>('questions');
  const [editingConfig, setEditingConfig] = useState(false);
  const [configText, setConfigText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadQuizData();
  }, []);

  // Expose setActiveTab to parent via DOM
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as any).setActiveTab = setActiveTab;
    }
  }, []);

  // Update active state of buttons in parent nav
  useEffect(() => {
    const buttons = document.querySelectorAll('[data-sub-tab-quiz]');
    buttons.forEach((btn) => {
      const btnElement = btn as HTMLButtonElement;
      const subTab = btnElement.getAttribute('data-sub-tab-quiz');
      if (subTab === activeTab) {
        btnElement.className = btnElement.className.replace('border-transparent text-slate-600', 'border-blue-600 text-blue-600');
      } else {
        btnElement.className = btnElement.className.replace('border-blue-600 text-blue-600', 'border-transparent text-slate-600');
      }
    });
  }, [activeTab]);

  const loadQuizData = async () => {
    setLoading(true);

    const { data: questionsData } = await supabase
      .from('quiz_questions')
      .select('*')
      .order('question_order');

    const { data: configData } = await supabase
      .from('quiz_config')
      .select('*')
      .eq('is_active', true)
      .single();

    if (questionsData) setQuestions(questionsData);
    if (configData) {
      setConfig(configData);
      setConfigText(JSON.stringify({
        scoring_logic: configData.scoring_logic,
        channel_mapping: configData.channel_mapping
      }, null, 2));
    }

    setLoading(false);
  };

  const startEdit = (question: QuizQuestion) => {
    setEditingQuestion(question.id);
    setEditedQuestion(question);
  };

  const cancelEdit = () => {
    setEditingQuestion(null);
    setEditedQuestion({});
  };

  const saveQuestion = async () => {
    if (!editingQuestion) return;

    const { error } = await supabase
      .from('quiz_questions')
      .update({
        question_text: editedQuestion.question_text,
        options: editedQuestion.options,
        reverse_scored: editedQuestion.reverse_scored,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingQuestion);

    if (!error) {
      await loadQuizData();
      cancelEdit();
    }
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;

    await supabase
      .from('quiz_questions')
      .delete()
      .eq('id', id);

    await loadQuizData();
  };

  const saveConfig = async () => {
    if (!config) return;

    try {
      const parsed = JSON.parse(configText);

      const { error } = await supabase
        .from('quiz_config')
        .update({
          scoring_logic: parsed.scoring_logic,
          channel_mapping: parsed.channel_mapping,
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id);

      if (!error) {
        await loadQuizData();
        setEditingConfig(false);
      }
    } catch (e) {
      alert('Invalid JSON format');
    }
  };

  const addOption = () => {
    const currentOptions = editedQuestion.options || [];
    setEditedQuestion({
      ...editedQuestion,
      options: [...currentOptions, { value: '', label: '' }]
    });
  };

  const updateOption = (index: number, field: 'value' | 'label', value: string) => {
    const currentOptions = [...(editedQuestion.options || [])];
    currentOptions[index] = { ...currentOptions[index], [field]: value };
    setEditedQuestion({ ...editedQuestion, options: currentOptions });
  };

  const removeOption = (index: number) => {
    const currentOptions = [...(editedQuestion.options || [])];
    currentOptions.splice(index, 1);
    setEditedQuestion({ ...editedQuestion, options: currentOptions });
  };

  const handleExportQuestions = () => {
    setExporting(true);

    try {
      // Create export data structure
      const exportData = {
        version: config?.version || '1.0',
        exported_at: new Date().toISOString(),
        questions: questions.map(q => ({
          question_order: q.question_order,
          question_type: q.question_type,
          question_text: q.question_text,
          options: q.options,
          reverse_scored: q.reverse_scored
        })),
        config: config ? {
          version: config.version,
          scoring_logic: config.scoring_logic,
          channel_mapping: config.channel_mapping
        } : null
      };

      // Create blob and download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz_questions_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert(`Successfully exported ${questions.length} questions`);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImportQuestions = async (file: File) => {
    if (!confirm('Import questions from JSON file? This will DELETE all existing questions and replace them with the imported ones. Are you sure?')) {
      return;
    }

    setImporting(true);

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate structure
      if (!importData.questions || !Array.isArray(importData.questions)) {
        throw new Error('Invalid file format: missing questions array');
      }

      // Delete existing questions
      const { error: deleteError } = await supabase
        .from('quiz_questions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (deleteError) throw deleteError;

      // Insert new questions
      const questionsToInsert = importData.questions.map((q: any) => ({
        question_order: q.question_order,
        question_type: q.question_type,
        question_text: q.question_text,
        options: q.options || [],
        reverse_scored: q.reverse_scored || false
      }));

      const { error: insertError } = await supabase
        .from('quiz_questions')
        .insert(questionsToInsert);

      if (insertError) throw insertError;

      // Update config if present in import
      if (importData.config && config) {
        const { error: configError } = await supabase
          .from('quiz_config')
          .update({
            version: importData.config.version,
            scoring_logic: importData.config.scoring_logic,
            channel_mapping: importData.config.channel_mapping,
            updated_at: new Date().toISOString()
          })
          .eq('id', config.id);

        if (configError) {
          console.error('Failed to update config:', configError);
        }
      }

      alert(`Successfully imported ${questionsToInsert.length} questions`);
      await loadQuizData();
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3" ref={containerRef} data-quiz-manager>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <FileJson size={16} />
          <span>Version: {config?.version || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportQuestions}
            disabled={exporting || questions.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            {exporting ? 'Exporting...' : 'Export Questions'}
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium cursor-pointer">
            <FileUp size={16} />
            {importing ? 'Importing...' : 'Import Questions'}
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleImportQuestions(e.target.files[0]);
                  e.target.value = ''; // Reset input
                }
              }}
              disabled={importing}
            />
          </label>
        </div>
      </div>

      {activeTab === 'questions' && (
        <div className="space-y-4">
          {questions.map((question) => (
            <div
              key={question.id}
              className="bg-white rounded-lg border border-slate-200 p-6"
            >
              {editingQuestion === question.id ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Question Text
                    </label>
                    <textarea
                      value={editedQuestion.question_text || ''}
                      onChange={(e) =>
                        setEditedQuestion({ ...editedQuestion, question_text: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                    />
                  </div>

                  {question.question_type === 'single_select' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-700">
                          Answer Options
                        </label>
                        <button
                          onClick={addOption}
                          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Plus size={14} />
                          Add Option
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(editedQuestion.options || []).map((option, idx) => (
                          <div key={idx} className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Value"
                              value={option.value}
                              onChange={(e) => updateOption(idx, 'value', e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <input
                              type="text"
                              placeholder="Label"
                              value={option.label}
                              onChange={(e) => updateOption(idx, 'label', e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <button
                              onClick={() => removeOption(idx)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`reverse-${question.id}`}
                      checked={editedQuestion.reverse_scored || false}
                      onChange={(e) =>
                        setEditedQuestion({ ...editedQuestion, reverse_scored: e.target.checked })
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={`reverse-${question.id}`} className="text-sm text-slate-700">
                      Reverse scored
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={saveQuestion}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                      <Save size={16} />
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2"
                    >
                      <X size={16} />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Q{question.question_order}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">{question.id}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {question.question_type}
                        </span>
                        {question.reverse_scored && (
                          <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                            Reverse scored
                          </span>
                        )}
                      </div>
                      <p className="text-slate-900 font-medium">{question.question_text}</p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => startEdit(question)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => deleteQuestion(question.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {question.question_type === 'single_select' && question.options.length > 0 && (
                    <div className="mt-3 pl-4 border-l-2 border-slate-200">
                      <p className="text-xs font-medium text-slate-600 mb-2">Options:</p>
                      <div className="space-y-1">
                        {question.options.map((option, idx) => (
                          <div key={idx} className="text-sm text-slate-700">
                            <span className="font-mono text-xs text-slate-500">{option.value}</span>
                            {' → '}
                            <span>{option.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'algorithm' && config && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">
                  Scoring Logic & Channel Mapping
                </h3>
              </div>
              {!editingConfig ? (
                <button
                  onClick={() => setEditingConfig(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Edit2 size={16} />
                  Edit Algorithm
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={saveConfig}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    <Save size={16} />
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingConfig(false);
                      setConfigText(JSON.stringify({
                        scoring_logic: config.scoring_logic,
                        channel_mapping: config.channel_mapping
                      }, null, 2));
                    }}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 flex items-center gap-2"
                  >
                    <X size={16} />
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {editingConfig ? (
              <div>
                <textarea
                  value={configText}
                  onChange={(e) => setConfigText(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  rows={25}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Edit the JSON configuration for scoring logic and channel family mappings.
                  Changes will affect all future quiz completions.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-slate-900 mb-3">OCEAN Personality Scoring</h4>
                  <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm space-y-1">
                    {Object.entries(config.scoring_logic.personality_scoring || {}).map(([key, value]) => (
                      <div key={key} className="text-slate-700">
                        <span className="text-blue-600">{key}:</span> {String(value)}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-slate-900 mb-3">Channel Families</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(config.channel_mapping.channel_families || {}).map(([family, data]: [string, any]) => (
                      <div key={family} className="bg-slate-50 rounded-lg p-4">
                        <h5 className="font-medium text-slate-900 capitalize mb-2">{family}</h5>
                        <p className="text-sm text-slate-600 mb-2">{data.description}</p>
                        <div className="text-xs text-slate-500 font-mono mb-2">
                          Weight: {data.base_weight}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {data.channels.map((channel: string) => (
                            <span
                              key={channel}
                              className="px-2 py-1 bg-white rounded text-xs text-slate-700 border border-slate-200"
                            >
                              {channel}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-slate-900 mb-3">Preference Modifiers</h4>
                  <div className="bg-slate-50 rounded-lg p-4">
                    <pre className="text-xs text-slate-700 overflow-x-auto">
                      {JSON.stringify(config.scoring_logic.preference_modifiers, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
