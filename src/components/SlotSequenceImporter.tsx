import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, Download, Save, ArrowLeft, Check, X, FileUp } from 'lucide-react';

interface Channel {
  id: string;
  channel_name: string;
  channel_number: number;
}

const DEFAULT_BOOSTS = [
  { field: 'speed', mode: 'near', weight: 2 },
  { field: 'intensity', mode: 'near', weight: 4 },
  { field: 'brightness', mode: 'near', weight: 1 },
  { field: 'complexity', mode: 'near', weight: 1 },
  { field: 'valence', mode: 'near', weight: 1 },
  { field: 'arousal', mode: 'near', weight: 1 },
  { field: 'bpm', mode: 'near', weight: 1 },
];

export function SlotSequenceImporter({ onBack }: { onBack: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [energyTier, setEnergyTier] = useState<'low' | 'medium' | 'high'>('medium');
  const [sequenceName, setSequenceName] = useState('');
  const [description, setDescription] = useState('');

  // Slot data - 20 slots by default
  const [numSlots, setNumSlots] = useState(20);
  const [speed, setSpeed] = useState<string>('');
  const [intensity, setIntensity] = useState<string>('');
  const [brightness, setBrightness] = useState<string>('');
  const [complexity, setComplexity] = useState<string>('');
  const [valence, setValence] = useState<string>('');
  const [arousal, setArousal] = useState<string>('');
  const [bpm, setBpm] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadChannels();
  }, []);

  async function loadChannels() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audio_channels')
        .select('id, channel_name, channel_number')
        .order('channel_name');

      if (error) {
        setMessage({ type: 'error', text: `Failed to load channels: ${error.message}` });
      } else if (data) {
        setChannels(data);
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Failed to load channels: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  function parseNumberArray(input: string): number[] {
    return input
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(s => s !== '')
      .map(s => parseFloat(s));
  }

  async function handleSave() {
    setMessage(null);

    // Validation
    if (!sequenceName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a sequence name' });
      return;
    }

    if (!selectedChannel) {
      setMessage({ type: 'error', text: 'Please select a channel' });
      return;
    }

    // Parse arrays
    const speedArr = parseNumberArray(speed);
    const intensityArr = parseNumberArray(intensity);
    const brightnessArr = parseNumberArray(brightness);
    const complexityArr = parseNumberArray(complexity);
    const valenceArr = parseNumberArray(valence);
    const arousalArr = parseNumberArray(arousal);
    const bpmArr = parseNumberArray(bpm);

    // Validate all arrays have the same length
    const arrays = [
      { name: 'Speed', arr: speedArr },
      { name: 'Intensity', arr: intensityArr },
      { name: 'Brightness', arr: brightnessArr },
      { name: 'Complexity', arr: complexityArr },
      { name: 'Valence', arr: valenceArr },
      { name: 'Arousal', arr: arousalArr },
      { name: 'BPM', arr: bpmArr },
    ];

    const expectedLength = numSlots;
    for (const { name, arr } of arrays) {
      if (arr.length !== expectedLength) {
        setMessage({
          type: 'error',
          text: `${name} has ${arr.length} values, expected ${expectedLength}`
        });
        return;
      }
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage({ type: 'error', text: 'You must be logged in' });
        return;
      }

      // Create definitions
      const definitions = [];
      for (let i = 0; i < numSlots; i++) {
        definitions.push({
          index: i + 1,
          targets: {
            speed: speedArr[i],
            intensity: intensityArr[i],
            brightness: brightnessArr[i],
            complexity: complexityArr[i],
            valence: valenceArr[i],
            arousal: arousalArr[i],
            bpm: bpmArr[i],
          },
          boosts: DEFAULT_BOOSTS,
        });
      }

      // Default rule group
      const ruleGroups = [
        {
          logic: 'AND',
          order: 0,
          rules: [
            {
              field: 'channel_id',
              operator: 'eq',
              value: selectedChannel,
            },
          ],
        },
      ];

      const { error } = await supabase
        .from('saved_slot_sequences')
        .insert({
          name: sequenceName.trim(),
          description: description.trim() || null,
          channel_id: selectedChannel,
          energy_tier: energyTier,
          num_slots: numSlots,
          recent_repeat_window: 5,
          definitions,
          rule_groups: ruleGroups,
          playback_continuation: 'continue',
          created_by: user.id,
        });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Sequence saved successfully!' });

      // Clear form
      setTimeout(() => {
        setSequenceName('');
        setDescription('');
        setSpeed('');
        setIntensity('');
        setBrightness('');
        setComplexity('');
        setValence('');
        setArousal('');
        setBpm('');
        setMessage(null);
      }, 2000);

    } catch (error: any) {
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setSaving(false);
    }
  }

  function loadExample() {
    setNumSlots(20);
    setSpeed('3 3 3 2 2 3 2 3 3 3 2 2 2 3 2 3 3 2 3 2');
    setIntensity('3 3 3 2 3 2 3 2 3 3 3 2 3 2 3 2 3 3 3 2');
    setBrightness('4 4 4 2 4 3 4 3 5 2 3 2 4 3 4 3 5 2 3 2');
    setComplexity('3 3 3 3 4 3 2 3 4 5 2 3 4 3 2 3 4 5 2 3');
    setValence('0.00 0.00 0.00 -0.10 0.20 0.50 0.30 0.10 -0.10 -0.20 -0.30 -0.20 0.50 0.60 0.40 0.35 -0.10 -0.20 -0.10 1.00');
    setArousal('0.10 0.00 0.10 0.20 0.25 0.35 0.40 0.50 0.00 0.10 0.20 0.30 0.50 0.70 0.40 0.30 -1.00 0.30 0.50 0.70');
    setBpm('86 86 86 83 83 84 86 88 89 92 94 95 97 99 100 75 76 90 95 78');
    setMessage({ type: 'success', text: 'Example data loaded - modify as needed' });
    setTimeout(() => setMessage(null), 3000);
  }

  function handleFileSelect() {
    fileInputRef.current?.click();
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage(null);

    try {
      const text = await file.text();
      const lines = text.trim().split('\n');

      if (lines.length < 8) {
        setMessage({ type: 'error', text: 'CSV file must have at least 8 rows (header + 7 fields)' });
        return;
      }

      const data: Record<string, number[]> = {};

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(p => p.trim());
        if (parts.length < 2) continue;

        const fieldName = parts[0].toLowerCase().replace(/^fields\/slots$/i, '');

        if (i === 0 && fieldName === '') {
          continue;
        }

        const values = parts.slice(1).map(v => parseFloat(v));
        data[fieldName] = values;
      }

      const requiredFields = ['speed', 'intensity', 'brightness', 'complexity', 'valence', 'arousal', 'bpm'];
      const missingFields = requiredFields.filter(field => !data[field]);

      if (missingFields.length > 0) {
        setMessage({
          type: 'error',
          text: `CSV must have rows for: ${requiredFields.join(', ')}. Missing: ${missingFields.join(', ')}`
        });
        return;
      }

      const slotCount = data['speed']?.length || 0;

      if (slotCount === 0) {
        setMessage({ type: 'error', text: 'No slot data found in CSV' });
        return;
      }

      for (const field of requiredFields) {
        if (data[field].length !== slotCount) {
          setMessage({
            type: 'error',
            text: `All fields must have the same number of slots. ${field} has ${data[field].length}, expected ${slotCount}`
          });
          return;
        }
      }

      setNumSlots(slotCount);
      setSpeed(data['speed'].join(' '));
      setIntensity(data['intensity'].join(' '));
      setBrightness(data['brightness'].join(' '));
      setComplexity(data['complexity'].join(' '));
      setValence(data['valence'].join(' '));
      setArousal(data['arousal'].join(' '));
      setBpm(data['bpm'].join(' '));

      setMessage({ type: 'success', text: `Loaded ${slotCount} slots from CSV file` });
      setTimeout(() => setMessage(null), 3000);

    } catch (error: any) {
      setMessage({ type: 'error', text: `Error reading CSV: ${error.message}` });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Admin
          </button>
          <h1 className="text-3xl font-bold text-slate-900">Import Slot Sequence</h1>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {message.type === 'success' ? <Check size={20} /> : <X size={20} />}
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-6 space-y-6">
          {/* Metadata Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Sequence Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={sequenceName}
                onChange={(e) => setSequenceName(e.target.value)}
                placeholder="e.g., Bach Beats Medium Energy"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Channel <span className="text-red-600">*</span>
              </label>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">
                  {loading ? 'Loading channels...' : `Select a channel (${channels.length} available)`}
                </option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.channel_name} (#{ch.channel_number})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Energy Tier <span className="text-red-600">*</span>
              </label>
              <select
                value={energyTier}
                onChange={(e) => setEnergyTier(e.target.value as 'low' | 'medium' | 'high')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Number of Slots <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                value={numSlots}
                onChange={(e) => setNumSlots(parseInt(e.target.value) || 20)}
                min="1"
                max="100"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={loadExample}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <Download size={18} />
                  Load Example Data
                </button>
                <button
                  onClick={handleFileSelect}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  <FileUp size={18} />
                  Import from CSV
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                CSV format: First row is header (FIELDS/SLOTS,1,2,3,...), then one row per field (Speed, Intensity, Brightness, Complexity, Valence, Arousal, Bpm)
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              Slot Values
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Enter {numSlots} space-separated or comma-separated values for each field.
              You can copy and paste directly from a spreadsheet.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Speed (0-5) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value)}
                  placeholder="e.g., 3 3 3 2 2 3 2 3..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Intensity (0-5) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={intensity}
                  onChange={(e) => setIntensity(e.target.value)}
                  placeholder="e.g., 3 3 3 2 3 2 3 2..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Brightness (0-5) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={brightness}
                  onChange={(e) => setBrightness(e.target.value)}
                  placeholder="e.g., 4 4 4 2 4 3 4 3..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Complexity (0-5) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={complexity}
                  onChange={(e) => setComplexity(e.target.value)}
                  placeholder="e.g., 3 3 3 3 4 3 2 3..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Valence (-1 to 1) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={valence}
                  onChange={(e) => setValence(e.target.value)}
                  placeholder="e.g., 0.00 0.00 0.00 -0.10 0.20..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Arousal (0-1) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={arousal}
                  onChange={(e) => setArousal(e.target.value)}
                  placeholder="e.g., 0.10 0.00 0.10 0.20 0.25..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  BPM (60-180) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={bpm}
                  onChange={(e) => setBpm(e.target.value)}
                  placeholder="e.g., 86 86 86 83 83 84..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-200">
            <button
              onClick={onBack}
              className="px-6 py-2 text-slate-700 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Sequence'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
