import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, Search, RefreshCw, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Trash2, Plus, X, MoreVertical, Pencil, Tag } from 'lucide-react';
import pb from '../lib/pocketbase';

// ── Costanti di stile ─────────────────────────────────────────────────────────

const BLOOM_STYLES = {
  remember:   { background: '#E6EEF6', color: '#2A5C8A' },
  understand: { background: '#E6F2ED', color: '#1F6B4E' },
  apply:      { background: '#EFF5E6', color: '#3F6B18' },
  analyze:    { background: '#FBF2DC', color: '#7A5010' },
  evaluate:   { background: '#F7EDE6', color: '#8A3A1A' },
  create:     { background: '#F3E8F0', color: '#6A2860' },
};

const C = {
  bg:          '#F5F0E8',
  surface:     '#FEFCF7',
  border:      '#DDD5C2',
  borderLight: '#EDE8DC',
  headerBg:    '#F0EBE0',
  expandBg:    '#F8F5EF',
  green:       '#2C3E2D',
  greenLight:  '#3A5C3C',
  greenText:   '#D4E8D0',
  greenAccent: '#A8C5A0',
  text:        '#1C2B1D',
  textMuted:   '#7A7060',
  textFaint:   '#9A9080',
  textBody:    '#5A5040',
  dot:         '#B8AD9A',
  error:       { bg: '#F7EDE6', border: '#E8C8B8', text: '#8A3A1A' },
};

const font  = "'DM Sans', sans-serif";
const serif = 'Lora, serif';

// ── Sub-componenti ────────────────────────────────────────────────────────────

function BloomBadge({ level }) {
  const s = BLOOM_STYLES[level?.toLowerCase()] ?? { background: '#EDEAE3', color: '#5A5040' };
  return (
    <span style={{ ...s, display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
      {level || '—'}
    </span>
  );
}

function JsonItems({ value }) {
  let items = [];
  if (Array.isArray(value)) items = value;
  else if (typeof value === 'object' && value !== null) items = Object.values(value);
  else if (typeof value === 'string' && value) {
    try { items = JSON.parse(value); } catch { items = [value]; }
  }
  if (!items.length) return <span style={{ color: C.dot, fontStyle: 'italic', fontSize: 13 }}>—</span>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: C.textBody, lineHeight: 1.5 }}>
          <span style={{ color: C.dot, flexShrink: 0, marginTop: 1 }}>·</span>
          <span>{String(item)}</span>
        </li>
      ))}
    </ul>
  );
}

function QuestionDetail({ question }) {
  return (
    <tr>
      <td colSpan={3} style={{ background: C.expandBg, borderBottom: `1px solid ${C.border}`, padding: 0 }}>
        <div style={{ padding: '20px 24px 20px 72px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>

          <div>
            <p style={{ fontSize: 10, fontWeight: 500, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 0 }}>
              Testo completo
            </p>
            <p style={{ fontSize: 14, color: C.text, lineHeight: 1.7, margin: 0 }}>
              {question.content || '—'}
            </p>
          </div>

          <div>
            <p style={{ fontSize: 10, fontWeight: 500, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 0 }}>
              Opzioni
            </p>
            <JsonItems value={question.options} />
          </div>

          <div>
            <p style={{ fontSize: 10, fontWeight: 500, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 0 }}>
              Risposta corretta
            </p>
            <p style={{ fontSize: 13, color: C.textBody, lineHeight: 1.5, margin: 0 }}>
              {question.correct_answer || <span style={{ color: C.dot, fontStyle: 'italic' }}>—</span>}
            </p>
          </div>

        </div>
      </td>
    </tr>
  );
}

function IconBtn({ onClick, disabled, title, children }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? C.dot : C.textMuted, opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  );
}

// ── AddQuestionModal ──────────────────────────────────────────────────────────

const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
const BLOOM_LABELS = { remember: 'Remember', understand: 'Understand', apply: 'Apply', analyze: 'Analyze', evaluate: 'Evaluate', create: 'Create' };

const initialForm = {
  subject:        '',
  topic:          '',
  content:        '',
  options:        [''],
  correct_answer: '',
  bloom_level:    '',
};

function SuggestInput({ label, value, onChange, suggestions }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    if (!value.trim()) return [];
    const q = value.trim().toLowerCase();
    return suggestions.filter(s => s.toLowerCase().includes(q));
  }, [value, suggestions]);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 4 }}>{label}</label>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: C.text, fontFamily: font, outline: 'none', boxSizing: 'border-box' }}
        onMouseEnter={e => e.target.style.borderColor = '#5C7A5E'}
        onMouseLeave={e => e.target.style.borderColor = C.border}
      />
      {open && filtered.length > 0 && (
        <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.10)', zIndex: 200, margin: '4px 0 0', padding: 0, listStyle: 'none', maxHeight: 180, overflowY: 'auto' }}>
          {filtered.map(s => (
            <li
              key={s}
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); }}
              style={{ padding: '8px 12px', fontSize: 13, color: C.textBody, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = C.expandBg}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddQuestionModal({ onClose, onSaved, data }) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Suggerimenti subject: tutti i valori unici in data
  const subjectSuggestions = useMemo(() => {
    const set = new Set(data.map(q => (q.subject || '').trim()).filter(Boolean));
    return [...set].sort();
  }, [data]);

  // Suggerimenti topic: solo quelli della subject selezionata
  const topicSuggestions = useMemo(() => {
    const subj = form.subject.trim().toLowerCase();
    if (!subj) return [];
    const set = new Set(
      data
        .filter(q => (q.subject || '').trim().toLowerCase() === subj)
        .map(q => (q.topic || '').trim())
        .filter(Boolean)
    );
    return [...set].sort();
  }, [data, form.subject]);

  // Se la correct_answer non è più tra le opzioni, resettala
  const validOptions = form.options.filter(o => o.trim() !== '');
  useEffect(() => {
    if (form.correct_answer && !validOptions.includes(form.correct_answer)) {
      setForm(f => ({ ...f, correct_answer: '' }));
    }
  }, [form.options]);

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    setFormError('');
  }

  function setOption(idx, val) {
    setForm(f => {
      const options = [...f.options];
      options[idx] = val;
      return { ...f, options };
    });
    setFormError('');
  }

  function addOption() {
    setForm(f => ({ ...f, options: [...f.options, ''] }));
  }

  function removeOption(idx) {
    setForm(f => {
      const options = f.options.filter((_, i) => i !== idx);
      return { ...f, options: options.length ? options : [''] };
    });
  }

  async function handleSubmit() {
    const content = form.content.trim();
    const opts = form.options.filter(o => o.trim() !== '');
    if (!content) { setFormError('Il testo della domanda è obbligatorio.'); return; }
    if (opts.length === 0) { setFormError('Aggiungi almeno un\'opzione di risposta.'); return; }
    if (!form.correct_answer || !opts.includes(form.correct_answer)) {
      setFormError('Seleziona una risposta corretta tra le opzioni.'); return;
    }
    setSaving(true);
    setFormError('');
    try {
      await pb.collection('Question').create({
        subject:        form.subject.trim(),
        topic:          form.topic.trim(),
        content,
        options:        opts,
        correct_answer: form.correct_answer,
        bloom_level:    form.bloom_level,
        owner:          pb.authStore.model.id,
      });
      onSaved();
    } catch (e) {
      setFormError('Errore durante il salvataggio. Riprova.');
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%', background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '8px 12px', fontSize: 13, color: C.text,
    fontFamily: font, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 4 };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,43,29,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: `min(600px, 90vw)`, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', fontFamily: font }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${C.borderLight}` }}>
          <h2 style={{ fontFamily: serif, fontSize: 17, fontWeight: 500, color: C.text, margin: 0 }}>Nuova domanda</h2>
          <button onClick={onClose} disabled={saving}
            style={{ background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', color: C.textMuted, padding: 4, display: 'flex', opacity: saving ? 0.4 : 1 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body scrollabile */}
        <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Subject */}
          <SuggestInput
            label="Materia"
            value={form.subject}
            onChange={v => setField('subject', v)}
            suggestions={subjectSuggestions}
          />

          {/* Topic */}
          <SuggestInput
            label="Argomento"
            value={form.topic}
            onChange={v => setField('topic', v)}
            suggestions={topicSuggestions}
          />

          {/* Content */}
          <div>
            <label style={labelStyle}>Testo della domanda *</label>
            <textarea
              value={form.content}
              onChange={e => setField('content', e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          {/* Options */}
          <div>
            <label style={labelStyle}>Opzioni di risposta *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.options.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    value={opt}
                    onChange={e => setOption(idx, e.target.value)}
                    placeholder={`Opzione ${idx + 1}`}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    onClick={() => removeOption(idx)}
                    style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0 }}
                    title="Rimuovi opzione"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={addOption}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'none', border: `1px dashed ${C.border}`, borderRadius: 8, cursor: 'pointer', color: C.textMuted, fontFamily: font, fontSize: 12, marginTop: 2 }}
              >
                <Plus size={12} /> Aggiungi opzione
              </button>
            </div>
          </div>

          {/* Correct answer */}
          <div>
            <label style={labelStyle}>Risposta corretta *</label>
            <select
              value={form.correct_answer}
              onChange={e => setField('correct_answer', e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">— seleziona —</option>
              {validOptions.map((o, i) => <option key={i} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Bloom level */}
          <div>
            <label style={labelStyle}>Livello Bloom</label>
            <select
              value={form.bloom_level}
              onChange={e => setField('bloom_level', e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">— nessuno —</option>
              {BLOOM_LEVELS.map(l => <option key={l} value={l}>{BLOOM_LABELS[l]}</option>)}
            </select>
          </div>

          {/* Errore form */}
          {formError && (
            <div style={{ background: C.error.bg, border: `1px solid ${C.error.border}`, color: C.error.text, fontSize: 13, borderRadius: 8, padding: '10px 14px' }}>
              {formError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 24px', borderTop: `1px solid ${C.borderLight}` }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ padding: '8px 18px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', color: C.textMuted, fontFamily: font, fontSize: 13, opacity: saving ? 0.5 : 1 }}
          >
            Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: C.green, border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', color: '#FFF', fontFamily: font, fontSize: 13, fontWeight: 500, opacity: saving ? 0.8 : 1 }}
          >
            {saving && (
              <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            )}
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EditQuestionModal ─────────────────────────────────────────────────────────

function EditQuestionModal({ question, onClose, onSaved, data }) {
  function parseOptions(raw) {
    if (Array.isArray(raw)) return raw.length ? raw : [''];
    if (typeof raw === 'string' && raw) {
      try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : [raw]; } catch { return [raw]; }
    }
    return [''];
  }

  const [form, setForm] = useState({
    subject:        question.subject || '',
    topic:          question.topic || '',
    content:        question.content || '',
    options:        parseOptions(question.options),
    correct_answer: question.correct_answer || '',
    bloom_level:    question.bloom_level || '',
  });
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  const subjectSuggestions = useMemo(() => {
    const set = new Set(data.map(q => (q.subject || '').trim()).filter(Boolean));
    return [...set].sort();
  }, [data]);

  const topicSuggestions = useMemo(() => {
    const subj = form.subject.trim().toLowerCase();
    if (!subj) return [];
    const set = new Set(
      data
        .filter(q => (q.subject || '').trim().toLowerCase() === subj)
        .map(q => (q.topic || '').trim())
        .filter(Boolean)
    );
    return [...set].sort();
  }, [data, form.subject]);

  const validOptions = form.options.filter(o => o.trim() !== '');

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); setFormError(''); }
  function setOption(idx, val) {
    setForm(f => { const options = [...f.options]; options[idx] = val; return { ...f, options }; });
    setFormError('');
  }
  function addOption() { setForm(f => ({ ...f, options: [...f.options, ''] })); }
  function removeOption(idx) {
    setForm(f => { const options = f.options.filter((_, i) => i !== idx); return { ...f, options: options.length ? options : [''] }; });
  }

  async function handleSubmit() {
    const content = form.content.trim();
    const opts = form.options.filter(o => o.trim() !== '');
    if (!content) { setFormError('Il testo della domanda è obbligatorio.'); return; }
    if (opts.length === 0) { setFormError("Aggiungi almeno un'opzione di risposta."); return; }
    if (!form.correct_answer || !opts.includes(form.correct_answer)) {
      setFormError('Seleziona una risposta corretta tra le opzioni.'); return;
    }
    setSaving(true); setFormError('');
    try {
      await pb.collection('Question').update(question.id, {
        subject:        form.subject.trim(),
        topic:          form.topic.trim(),
        content,
        options:        opts,
        correct_answer: form.correct_answer,
        bloom_level:    form.bloom_level,
      });
      onSaved();
    } catch {
      setFormError('Errore durante il salvataggio. Riprova.');
      setSaving(false);
    }
  }

  const inputStyle = { width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: C.text, fontFamily: font, outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,43,29,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={() => { if (!saving) onClose(); }}
    >
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: `min(600px, 90vw)`, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', fontFamily: font }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${C.borderLight}` }}>
          <h2 style={{ fontFamily: serif, fontSize: 17, fontWeight: 500, color: C.text, margin: 0 }}>Modifica domanda</h2>
          <button onClick={onClose} disabled={saving}
            style={{ background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', color: C.textMuted, padding: 4, display: 'flex', opacity: saving ? 0.4 : 1 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body scrollabile */}
        <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SuggestInput label="Materia" value={form.subject} onChange={v => setField('subject', v)} suggestions={subjectSuggestions} />
          <SuggestInput label="Argomento" value={form.topic} onChange={v => setField('topic', v)} suggestions={topicSuggestions} />

          <div>
            <label style={labelStyle}>Testo della domanda *</label>
            <textarea value={form.content} onChange={e => setField('content', e.target.value)} rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </div>

          <div>
            <label style={labelStyle}>Opzioni di risposta *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.options.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={opt} onChange={e => setOption(idx, e.target.value)} placeholder={`Opzione ${idx + 1}`} style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => removeOption(idx)}
                    style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0 }}
                    title="Rimuovi opzione"><X size={13} /></button>
                </div>
              ))}
              <button onClick={addOption}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'none', border: `1px dashed ${C.border}`, borderRadius: 8, cursor: 'pointer', color: C.textMuted, fontFamily: font, fontSize: 12, marginTop: 2 }}>
                <Plus size={12} /> Aggiungi opzione
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Risposta corretta *</label>
            <select value={form.correct_answer} onChange={e => setField('correct_answer', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">— seleziona —</option>
              {validOptions.map((o, i) => <option key={i} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Livello Bloom</label>
            <select value={form.bloom_level} onChange={e => setField('bloom_level', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">— nessuno —</option>
              {BLOOM_LEVELS.map(l => <option key={l} value={l}>{BLOOM_LABELS[l]}</option>)}
            </select>
          </div>

          {formError && (
            <div style={{ background: C.error.bg, border: `1px solid ${C.error.border}`, color: C.error.text, fontSize: 13, borderRadius: 8, padding: '10px 14px' }}>
              {formError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 24px', borderTop: `1px solid ${C.borderLight}` }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '8px 18px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', color: C.textMuted, fontFamily: font, fontSize: 13, opacity: saving ? 0.5 : 1 }}>
            Annulla
          </button>
          <button onClick={handleSubmit} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: C.green, border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', color: '#FFF', fontFamily: font, fontSize: 13, fontWeight: 500, opacity: saving ? 0.8 : 1 }}>
            {saving && <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
            {saving ? 'Salvataggio…' : 'Salva modifiche'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principale ─────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData]                         = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState('');
  const [globalFilter, setGlobalFilter]         = useState('');
  const [expandedSubjects,  setExpandedSubjects]  = useState(new Set());
  const [expandedTopics,    setExpandedTopics]    = useState(new Set());
  const [expandedQuestions, setExpandedQuestions] = useState(new Set());
  const [selectedIds,       setSelectedIds]       = useState(new Set());
  const [showDeleteModal, setShowDeleteModal]     = useState(false);
  const [deleting, setDeleting]                   = useState(false);
  const [showAddModal, setShowAddModal]           = useState(false);
  const [openMenuId, setOpenMenuId]               = useState(null);
  const [editQuestion, setEditQuestion]           = useState(null);
  const [page, setPage]                         = useState(0);
  const [pageSize, setPageSize]                 = useState(10);
  const navigate = useNavigate();
  const user = pb.authStore.model;

  async function loadQuestions() {
    setLoading(true); setError('');
    setSelectedIds(new Set());
    try {
      const records = await pb.collection('Question').getFullList({ sort: '-created' });
      setData(records);
    } catch {
      setError('Errore nel caricamento delle domande.');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id, e) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    setDeleting(true);
    try {
      await Promise.all([...selectedIds].map(id => pb.collection('Question').delete(id)));
      setSelectedIds(new Set());
      setShowDeleteModal(false);
      await loadQuestions();
    } catch {
      setError('Errore durante l\'eliminazione delle domande.');
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => { loadQuestions(); }, []);
  useEffect(() => { setPage(0); }, [globalFilter]);
  useEffect(() => {
    function closeMenu() { setOpenMenuId(null); }
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  // ── Filtraggio ──
  const filteredQuestions = useMemo(() => {
    if (!globalFilter) return data;
    const q = globalFilter.toLowerCase();
    return data.filter(row =>
      row.subject?.toLowerCase().includes(q) ||
      row.topic?.toLowerCase().includes(q) ||
      row.content?.toLowerCase().includes(q) ||
      row.bloom_level?.toLowerCase().includes(q)
    );
  }, [data, globalFilter]);

  // ── Raggruppamento per materia → argomento ──
  const groupedData = useMemo(() => {
    const groups = {};
    filteredQuestions.forEach(q => {
      const subject = (q.subject || 'Senza materia').trim();
      const topic   = (q.topic   || 'Senza argomento').trim();
      if (!groups[subject]) groups[subject] = {};
      if (!groups[subject][topic]) groups[subject][topic] = [];
      groups[subject][topic].push(q);
    });
    return Object.entries(groups).map(([subject, topicsMap]) => ({
      subject,
      topics: Object.entries(topicsMap).map(([topic, questions]) => ({ topic, questions })),
    }));
  }, [filteredQuestions]);

  const totalGroups = groupedData.length;
  const pageCount   = Math.max(1, Math.ceil(totalGroups / pageSize));
  const safePageIdx = Math.min(page, pageCount - 1);
  const pagedGroups = groupedData.slice(safePageIdx * pageSize, (safePageIdx + 1) * pageSize);

  function toggleSubject(subject) {
    setExpandedSubjects(prev => {
      const next = new Set(prev);
      next.has(subject) ? next.delete(subject) : next.add(subject);
      return next;
    });
  }

  function toggleTopic(key) {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleQuestion(id) {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleLogout() { pb.authStore.clear(); navigate('/login'); }

  // ── Render ──
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        .tbl-row { cursor: pointer; transition: background 0.1s; }
        .tbl-row:hover > td { background: #EDE8DC !important; }
        .tbl-row-q:hover > td { background: #EDE8DC !important; }
      `}</style>

      <div style={{ minHeight: '100vh', background: C.bg, fontFamily: font }}>

        {/* ── Topbar ── */}
        <header style={{ position: 'sticky', top: 0, zIndex: 10, background: C.surface, borderBottom: `1px solid ${C.border}`, height: 56, padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, background: C.green, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={14} color={C.greenAccent} />
            </div>
            <span style={{ fontFamily: serif, fontSize: 16, color: C.text, fontWeight: 500 }}>Portale Docenti</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: C.textMuted }}>{user?.email}</span>
            <button onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textMuted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: font }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#B05A3A'; e.currentTarget.style.color = '#B05A3A'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}
            >
              <LogOut size={13} /> Logout
            </button>
          </div>
        </header>

        {/* ── Main ── */}
        <main style={{ padding: '2rem 1.5rem', maxWidth: 1200, margin: '0 auto' }}>

          {/* Intestazione */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={{ fontFamily: serif, fontSize: 22, color: C.text, fontWeight: 500, margin: '0 0 4px' }}>
              Domande d'Esame
            </h1>
            <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
              {filteredQuestions.length} domande{globalFilter ? ' trovate' : ' totali'} · {totalGroups} materie · clicca una riga per espanderla
            </p>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textFaint }} />
              <input
                value={globalFilter ?? ''}
                onChange={e => setGlobalFilter(e.target.value)}
                placeholder="Cerca per materia, argomento, contenuto, livello…"
                style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px 8px 32px', fontSize: 13, color: C.text, fontFamily: font, outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#5C7A5E'}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>

            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, color: C.textMuted, fontFamily: font, cursor: 'pointer', outline: 'none' }}
            >
              {[10, 20, 50].map(n => <option key={n} value={n}>{n} per pagina</option>)}
            </select>

            <button onClick={loadQuestions} title="Aggiorna"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', color: C.textMuted }}>
              <RefreshCw size={14} />
            </button>

            <button onClick={() => setShowAddModal(true)} title="Aggiungi domanda"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: C.green, border: 'none', borderRadius: 8, cursor: 'pointer', color: '#FFF', fontFamily: font, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
              <Plus size={14} /> Aggiungi
            </button>

            {selectedIds.size > 0 && (
              <button onClick={() => setShowDeleteModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: C.error.bg, border: `1px solid ${C.error.border}`, borderRadius: 8, cursor: 'pointer', color: C.error.text, fontFamily: font, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                <Trash2 size={14} />
                Elimina {selectedIds.size} {selectedIds.size === 1 ? 'domanda' : 'domande'}
              </button>
            )}
          </div>

          {/* Errore */}
          {error && (
            <div style={{ background: C.error.bg, border: `1px solid ${C.error.border}`, color: C.error.text, fontSize: 13, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Tabella */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>

                <thead>
                  <tr>
                    <th style={thStyle(72)}></th>
                    <th style={thStyle()}>Materia / Argomento / Domanda</th>
                    <th style={thStyle(170)}>Livello Bloom</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} style={{ padding: '3rem', textAlign: 'center', color: C.textFaint }}>
                        <span style={{ display: 'inline-block', width: 16, height: 16, border: `2px solid ${C.border}`, borderTopColor: '#5C7A5E', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 8, verticalAlign: 'middle' }} />
                        Caricamento…
                      </td>
                    </tr>
                  ) : pagedGroups.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: '3rem', textAlign: 'center', color: C.textFaint, fontSize: 13 }}>
                        Nessuna domanda trovata.
                      </td>
                    </tr>
                  ) : (
                    pagedGroups.flatMap(({ subject, topics }, gi) => {
                      const isSubjectExpanded = expandedSubjects.has(subject);
                      const isEvenGroup = gi % 2 === 0;
                      const groupBg = isEvenGroup ? 'transparent' : '#FAF7F2';

                      const allSubjectQuestions = topics.flatMap(t => t.questions);
                      const selectedInSubject = allSubjectQuestions.filter(q => selectedIds.has(q.id)).length;
                      const allInSubjectSelected = selectedInSubject === allSubjectQuestions.length && allSubjectQuestions.length > 0;

                      // ── Livello 1: riga materia ──
                      const subjectRow = (
                        <tr key={`subject-${subject}`} className="tbl-row"
                          onClick={() => toggleSubject(subject)}
                          style={{ borderBottom: `1px solid ${isSubjectExpanded ? C.border : C.borderLight}` }}
                        >
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle', background: groupBg, width: 72 }}>
                            <ChevronRight size={14} style={{ transform: isSubjectExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: isSubjectExpanded ? C.green : C.textMuted, display: 'block' }} />
                          </td>
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle', background: groupBg }}>
                            <span style={{ fontFamily: serif, fontWeight: 500, fontSize: 14, color: C.text }}>
                              {subject}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle', background: groupBg, textAlign: 'right' }}>
                            {selectedInSubject > 0 && (
                              <span style={{ fontSize: 11, color: C.error.text, background: C.error.bg, border: `1px solid ${C.error.border}`, borderRadius: 20, padding: '2px 8px', marginRight: 6, whiteSpace: 'nowrap' }}>
                                {allInSubjectSelected ? 'tutte selezionate' : `${selectedInSubject} selezionate`}
                              </span>
                            )}
                            <span style={{ fontSize: 12, color: C.textMuted, background: C.headerBg, border: `1px solid ${C.borderLight}`, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                              {allSubjectQuestions.length} {allSubjectQuestions.length === 1 ? 'domanda' : 'domande'}
                            </span>
                          </td>
                        </tr>
                      );

                      if (!isSubjectExpanded) return [subjectRow];

                      // ── Livello 2: righe argomento ──
                      const topicRows = topics.flatMap(({ topic, questions }) => {
                        const topicKey = `${subject}::${topic}`;
                        const isTopicExpanded = expandedTopics.has(topicKey);
                        const topicBg = '#F5F2EB';
                        const selectedInTopic = questions.filter(q => selectedIds.has(q.id)).length;

                        const topicRow = (
                          <tr key={`topic-${topicKey}`} className="tbl-row"
                            onClick={() => toggleTopic(topicKey)}
                            style={{ borderBottom: `1px solid ${isTopicExpanded ? C.border : C.borderLight}` }}
                          >
                            <td style={{ padding: '10px 14px', verticalAlign: 'middle', background: topicBg, width: 72 }}>
                              <div style={{ paddingLeft: 20 }}>
                                <ChevronRight size={13} style={{ transform: isTopicExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: isTopicExpanded ? C.greenLight : C.textFaint, display: 'block' }} />
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px 10px 34px', verticalAlign: 'middle', background: topicBg }}>
                              <span style={{ fontSize: 13, color: C.textBody, fontWeight: 500 }}>
                                {topic}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', verticalAlign: 'middle', background: topicBg, textAlign: 'right' }}>
                              {selectedInTopic > 0 && (
                                <span style={{ fontSize: 11, color: C.error.text, background: C.error.bg, border: `1px solid ${C.error.border}`, borderRadius: 20, padding: '2px 8px', marginRight: 6, whiteSpace: 'nowrap' }}>
                                  {selectedInTopic} {selectedInTopic === 1 ? 'selezionata' : 'selezionate'}
                                </span>
                              )}
                              <span style={{ fontSize: 12, color: C.textMuted, background: C.headerBg, border: `1px solid ${C.borderLight}`, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                                {questions.length} {questions.length === 1 ? 'domanda' : 'domande'}
                              </span>
                            </td>
                          </tr>
                        );

                        if (!isTopicExpanded) return [topicRow];

                        // ── Livello 3: righe domanda ──
                        const questionRows = questions.flatMap(q => {
                          const isQuestionExpanded = expandedQuestions.has(q.id);
                          const qBg = '#F3EFE8';

                          const qRow = (
                            <tr key={`q-${q.id}`} className="tbl-row-q"
                              onClick={() => toggleQuestion(q.id)}
                              style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: 'pointer', transition: 'background 0.1s' }}
                            >
                              {/* Checkbox + Expander */}
                              <td style={{ padding: '10px 14px', verticalAlign: 'middle', background: qBg, width: 72 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(q.id)}
                                    onChange={e => toggleSelect(q.id, e)}
                                    onClick={e => e.stopPropagation()}
                                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: C.green, flexShrink: 0 }}
                                  />
                                  <ChevronRight size={13} style={{ transform: isQuestionExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: isQuestionExpanded ? C.green : C.textFaint, display: 'block', flexShrink: 0 }} />
                                </div>
                              </td>
                              {/* Anteprima contenuto */}
                              <td style={{ padding: '10px 14px 10px 48px', verticalAlign: 'middle', background: qBg }}>
                                <span style={{ fontSize: 12.5, color: C.textBody, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                  {q.content || '—'}
                                </span>
                              </td>
                              {/* Badge Bloom + Azioni */}
                              <td style={{ padding: '10px 14px', verticalAlign: 'middle', background: qBg }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                  <BloomBadge level={q.bloom_level} />
                                  <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
                                    <button
                                      onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === q.id ? null : q.id); }}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', padding: '2px 4px', borderRadius: 4 }}
                                      title="Azioni"
                                    >
                                      <MoreVertical size={14} />
                                    </button>
                                    {openMenuId === q.id && (
                                      <div style={{ position: 'absolute', right: 0, top: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 160, overflow: 'hidden' }}>
                                        <button
                                          onClick={e => { e.stopPropagation(); setEditQuestion(q); setOpenMenuId(null); }}
                                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: C.textBody, fontFamily: font, fontSize: 13, textAlign: 'left' }}
                                          onMouseEnter={e => e.currentTarget.style.background = C.expandBg}
                                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                        >
                                          <Pencil size={13} /> Modifica
                                        </button>
                                        <button
                                          onClick={e => { e.stopPropagation(); setSelectedIds(new Set([q.id])); setShowDeleteModal(true); setOpenMenuId(null); }}
                                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: C.error.text, fontFamily: font, fontSize: 13, textAlign: 'left' }}
                                          onMouseEnter={e => e.currentTarget.style.background = C.error.bg}
                                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                        >
                                          <Trash2 size={13} /> Elimina
                                        </button>
                                        <button
                                          onClick={e => { e.stopPropagation(); setOpenMenuId(null); }}
                                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', color: C.textBody, fontFamily: font, fontSize: 13, textAlign: 'left' }}
                                          onMouseEnter={e => e.currentTarget.style.background = C.expandBg}
                                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                        >
                                          <Tag size={13} /> Classifica
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );

                          // ── Livello 4: dettaglio domanda ──
                          const detailRow = isQuestionExpanded
                            ? <QuestionDetail key={`detail-${q.id}`} question={q} />
                            : null;

                          return detailRow ? [qRow, detailRow] : [qRow];
                        });

                        return [topicRow, ...questionRows];
                      });

                      return [subjectRow, ...topicRows];
                    })
                  )}
                </tbody>

              </table>
            </div>
          </div>

          {/* ── Paginazione ── */}
          {!loading && totalGroups > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.textFaint }}>
                Pagina {safePageIdx + 1} di {pageCount} · {totalGroups} materie · {filteredQuestions.length} domande
              </span>

              <div style={{ display: 'flex', gap: 4 }}>
                <IconBtn onClick={() => setPage(0)} disabled={safePageIdx === 0} title="Prima pagina">
                  <ChevronsLeft size={13} />
                </IconBtn>
                <IconBtn onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePageIdx === 0} title="Pagina precedente">
                  <ChevronLeft size={13} />
                </IconBtn>
                <IconBtn onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePageIdx >= pageCount - 1} title="Pagina successiva">
                  <ChevronRight size={13} />
                </IconBtn>
                <IconBtn onClick={() => setPage(pageCount - 1)} disabled={safePageIdx >= pageCount - 1} title="Ultima pagina">
                  <ChevronsRight size={13} />
                </IconBtn>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ── Modale modifica domanda ── */}
      {editQuestion && (
        <EditQuestionModal
          question={editQuestion}
          data={data}
          onClose={() => setEditQuestion(null)}
          onSaved={() => { setEditQuestion(null); loadQuestions(); }}
        />
      )}

      {/* ── Modale aggiunta domanda ── */}
      {showAddModal && (
        <AddQuestionModal
          data={data}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); loadQuestions(); }}
        />
      )}

      {/* ── Modale di conferma eliminazione ── */}
      {showDeleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,43,29,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => { if (!deleting) setShowDeleteModal(false); }}
        >
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', fontFamily: font }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, background: C.error.bg, border: `1px solid ${C.error.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={16} color={C.error.text} />
              </div>
              <h2 style={{ fontFamily: serif, fontSize: 17, fontWeight: 500, color: C.text, margin: 0 }}>
                Elimina domande
              </h2>
            </div>

            <p style={{ fontSize: 14, color: C.textBody, lineHeight: 1.6, margin: '0 0 24px' }}>
              Stai per eliminare <strong>{selectedIds.size} {selectedIds.size === 1 ? 'domanda' : 'domande'}</strong>. Questa azione è irreversibile.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{ padding: '8px 18px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: deleting ? 'not-allowed' : 'pointer', color: C.textMuted, fontFamily: font, fontSize: 13, opacity: deleting ? 0.5 : 1 }}
              >
                Annulla
              </button>
              <button
                onClick={deleteSelected}
                disabled={deleting}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: C.error.text, border: 'none', borderRadius: 8, cursor: deleting ? 'not-allowed' : 'pointer', color: '#FFF', fontFamily: font, fontSize: 13, fontWeight: 500, opacity: deleting ? 0.8 : 1 }}
              >
                {deleting && (
                  <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                )}
                {deleting ? 'Eliminazione…' : 'Elimina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Helper stile th ───────────────────────────────────────────────────────────
function thStyle(width) {
  return {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 10.5,
    fontWeight: 500,
    color: C.textMuted,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    borderBottom: `1px solid ${C.border}`,
    background: C.headerBg,
    whiteSpace: 'nowrap',
    userSelect: 'none',
    ...(width ? { width } : {}),
  };
}
