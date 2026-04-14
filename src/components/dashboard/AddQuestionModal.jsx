import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, X, Pencil, Check } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pb from '../../lib/pocketbase';
import { C, font, serif, BLOOM_LEVELS, BLOOM_LABELS } from '../../styles/theme';
import SuggestInput from './SuggestInput';

// Configura il worker PDF (necessario per pdfjs-dist in ambiente browser/Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

const initialForm = {
  subject:        '',
  topic:          '',
  content:        '',
  options:        [''],
  correct_answer: '',
  bloom_level:    '',
};

// Estrae il testo da un PDF tramite pdfjs — equivalente a fitz in Python
async function extractTextFromPdf(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    text += pageText + '\n';
  }
  return text;
}

function parseGeneratedQuestions(rawText) {
  const questions = [];
  const blocks = rawText.trim().split(/\n(?=> )/);
  for (const block of blocks) {
    try {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 6) continue;
      const content = lines[0].replace(/^> /, '').trim();
      const opts = [1, 2, 3, 4].map(i => lines[i].replace(/^[a-d]\) /, ''));
      const ansMatch = block.match(/\* Correct Answer:\s*([a-d])\)?/i);
      const ansLetter = ansMatch ? ansMatch[1].toLowerCase() : 'a';
      const correct_answer = opts[['a', 'b', 'c', 'd'].indexOf(ansLetter)] || opts[0];
      questions.push({ content, options: opts, correct_answer });
    } catch { continue; }
  }
  return questions;
}

export default function AddQuestionModal({ onClose, onSaved, data }) {
  // --- Manual form state ---
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [warning, setWarning] = useState('');

  // --- Mode ---
  const [mode, setMode] = useState('manual'); // 'manual' | 'generate'

  // --- Generate mode state ---
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [numQuestions, setNumQuestions] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [selectedGenIdx, setSelectedGenIdx] = useState(new Set());
  const [genError, setGenError] = useState('');
  const [savingGenerated, setSavingGenerated] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [showDocList, setShowDocList] = useState(false);
  const docSearchRef = useRef(null);
  const [editingGenIdx, setEditingGenIdx] = useState(null);
  const [editGenForm, setEditGenForm] = useState({ content: '', options: [''], correct_answer: '' });

  // --- Manual form derived state ---
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
  useEffect(() => {
    if (form.correct_answer && !validOptions.includes(form.correct_answer)) {
      setForm(f => ({ ...f, correct_answer: '' }));
    }
  }, [form.options]);

  // Close doc dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e) {
      if (docSearchRef.current && !docSearchRef.current.contains(e.target)) setShowDocList(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Load documents when switching to generate mode
  useEffect(() => {
    if (mode !== 'generate') return;
    if (documents.length > 0) return;
    setLoadingDocs(true);
    pb.collection('Document').getFullList({ sort: '-created' })
      .then(docs => {
        setDocuments(docs.filter(d => d.owner === pb.authStore.model.id));
      })
      .catch(() => setGenError('Impossibile caricare i documenti.'))
      .finally(() => setLoadingDocs(false));
  }, [mode]);

  // --- Manual form handlers ---
  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); setFormError(''); setWarning(''); }
  function setOption(idx, val) {
    setForm(f => { const options = [...f.options]; options[idx] = val; return { ...f, options }; });
    setFormError('');
  }
  function addOption() { setForm(f => ({ ...f, options: [...f.options, ''] })); }
  function removeOption(idx) {
    setForm(f => { const options = f.options.filter((_, i) => i !== idx); return { ...f, options: options.length ? options : [''] }; });
  }

  async function handleSubmit() {
    const subject = form.subject.trim();
    const topic   = form.topic.trim();
    const content = form.content.trim();
    const opts    = form.options.filter(o => o.trim() !== '');

    if (!content) { setFormError('Il testo della domanda è obbligatorio.'); setWarning(''); return; }
    if (opts.length === 0) { setFormError("Aggiungi almeno un'opzione di risposta."); setWarning(''); return; }
    if (!form.correct_answer || !opts.includes(form.correct_answer)) {
      setFormError('Seleziona una risposta corretta tra le opzioni.'); setWarning(''); return;
    }
    if (!subject && topic) { setFormError('Inserisci la materia prima di specificare un argomento.'); setWarning(''); return; }

    const warnMsg = !subject && !topic
      ? 'Sicuro di voler salvare la domanda senza materia e senza argomento?'
      : subject && !topic
        ? 'Sicuro di voler salvare la domanda senza argomento?'
        : '';
    if (warnMsg && warning !== warnMsg) { setWarning(warnMsg); setFormError(''); return; }

    setSaving(true); setFormError(''); setWarning('');
    try {
      await pb.collection('Question').create({
        subject, topic, content,
        options:        opts,
        correct_answer: form.correct_answer,
        bloom_level:    form.bloom_level,
        owner:          pb.authStore.model.id,
      });
      onSaved();
    } catch {
      setFormError('Errore durante il salvataggio. Riprova.');
      setSaving(false);
    }
  }

  // --- Generate mode handlers ---
  async function handleGenerate() {
    if (!selectedDocId) { setGenError('Seleziona un documento.'); return; }
    const doc = documents.find(d => d.id === selectedDocId);
    if (!doc) { setGenError('Documento non trovato.'); return; }

    setGenerating(true);
    setGenError('');
    setGeneratedQuestions([]);
    setSelectedGenIdx(new Set());

    try {
      const fileUrl = pb.files.getURL(doc, doc.file);
      const ext = (doc.file || '').split('.').pop().toLowerCase();

      let docText = '';
      if (ext === 'txt') {
        const res = await fetch(fileUrl);
        docText = await res.text();
      } else if (ext === 'pdf') {
        docText = await extractTextFromPdf(fileUrl);
      } else {
        // Formato non supportato per estrazione testo: usa i metadati come fallback
        docText = [
          doc.title   ? `Titolo: ${doc.title}`     : '',
          doc.subject ? `Materia: ${doc.subject}`  : '',
          doc.topic   ? `Argomento: ${doc.topic}`  : '',
        ].filter(Boolean).join('\n');
      }

      const prompt = `Crea un quiz di livello scuola superiore basato sul testo fornito.
    Genera esattamente ${numQuestions} domande in lingua ITALIANA.
    Rispetta rigorosamente questo formato per ogni domanda:

    > [Testo della domanda]
    a) [Opzione A]
    b) [Opzione B]
    c) [Opzione C]
    d) [Opzione D]
    * Correct Answer: [Lettera, esempio: a)]

    Testo: ${docText.slice(0, 4000)}`;

      const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.1-8b-instruct',
          messages: [
            { role: 'system', content: 'Sei un esperto nella creazione di quiz educativi.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.5,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API error ${response.status}: ${err}`);
      }

      const json = await response.json();
      const rawText = json.choices?.[0]?.message?.content || '';
      const parsed = parseGeneratedQuestions(rawText);

      if (parsed.length === 0) {
        setGenError('Nessuna domanda riconosciuta nella risposta. Riprova.');
      } else {
        const docSubject = doc?.subject?.trim() || '';
        const docTopic   = doc?.topic?.trim()   || '';
        const withMeta   = parsed.map(q => ({ ...q, subject: docSubject, topic: docTopic }));
        setGeneratedQuestions(withMeta);
        // Pre-select all
        setSelectedGenIdx(new Set(withMeta.map((_, i) => i)));
      }
    } catch (err) {
      setGenError('Generazione fallita: ' + err.message);
    } finally {
      setGenerating(false);
    }
  }

  function openEditGen(idx) {
    const q = generatedQuestions[idx];
    setEditingGenIdx(idx);
    setEditGenForm({ subject: q.subject || '', topic: q.topic || '', content: q.content, options: [...q.options], correct_answer: q.correct_answer });
  }

  function confirmEditGen() {
    const opts = editGenForm.options.filter(o => o.trim() !== '');
    if (!editGenForm.content.trim() || opts.length === 0) return;
    const correct_answer = opts.includes(editGenForm.correct_answer) ? editGenForm.correct_answer : opts[0];
    setGeneratedQuestions(prev => prev.map((q, i) => i === editingGenIdx ? { ...q, subject: editGenForm.subject, topic: editGenForm.topic, content: editGenForm.content.trim(), options: opts, correct_answer } : q));
    setEditingGenIdx(null);
  }

  function setEditGenOption(idx, val) {
    setEditGenForm(f => { const options = [...f.options]; options[idx] = val; return { ...f, options }; });
  }

  function toggleGenIdx(idx) {
    setSelectedGenIdx(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function handleSaveGenerated() {
    if (selectedGenIdx.size === 0) { setGenError('Seleziona almeno una domanda.'); return; }

    const selected = [...selectedGenIdx].sort().map(i => generatedQuestions[i]);

    // Save all selected directly
    setSavingGenerated(true);
    setGenError('');
    try {
      await Promise.all(selected.map(q =>
        pb.collection('Question').create({
          subject:        q.subject || '',
          topic:          q.topic   || '',
          content:        q.content,
          options:        q.options,
          correct_answer: q.correct_answer,
          bloom_level:    '',
          owner:          pb.authStore.model.id,
        })
      ));
      onSaved();
    } catch {
      setGenError('Errore durante il salvataggio. Riprova.');
      setSavingGenerated(false);
    }
  }

  const isBusy = saving || generating || savingGenerated;

  const inputStyle = {
    width: '100%', background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '8px 12px', fontSize: 13, color: C.text,
    fontFamily: font, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 4 };
  const tabStyle = (active) => ({
    padding: '6px 14px', fontSize: 13, fontFamily: font, borderRadius: 8,
    cursor: 'pointer', fontWeight: active ? 500 : 400,
    background: active ? C.green : 'transparent',
    color: active ? '#FFF' : C.textMuted,
    border: active ? 'none' : `1px solid ${C.border}`,
  });
  const spinnerStyle = {
    display: 'inline-block', width: 12, height: 12,
    border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFF',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,43,29,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={() => { if (!isBusy) onClose(); }}
    >
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: `min(600px, 90vw)`, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', fontFamily: font }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.borderLight}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontFamily: serif, fontSize: 17, fontWeight: 500, color: C.text, margin: 0 }}>Nuova domanda</h2>
            <button onClick={onClose} disabled={isBusy}
              style={{ background: 'none', border: 'none', cursor: isBusy ? 'not-allowed' : 'pointer', color: C.textMuted, padding: 4, display: 'flex', opacity: isBusy ? 0.4 : 1 }}>
              <X size={16} />
            </button>
          </div>
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={tabStyle(mode === 'manual')} onClick={() => { if (!isBusy) setMode('manual'); }}>
              Manuale
            </button>
            <button style={tabStyle(mode === 'generate')} onClick={() => { if (!isBusy) setMode('generate'); }}>
              Genera da documento
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── MANUAL MODE ── */}
          {mode === 'manual' && (<>
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
                      style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0 }}>
                      <X size={13} />
                    </button>
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

            {warning && (
              <div style={{ background: '#FBF2DC', border: '1px solid #D4B84A', color: '#7A5010', fontSize: 13, borderRadius: 8, padding: '10px 14px' }}>
                {warning} Premi nuovamente "Salva" per confermare.
              </div>
            )}
            {formError && (
              <div style={{ background: C.error.bg, border: `1px solid ${C.error.border}`, color: C.error.text, fontSize: 13, borderRadius: 8, padding: '10px 14px' }}>
                {formError}
              </div>
            )}
          </>)}

          {/* ── GENERATE MODE ── */}
          {mode === 'generate' && (<>
            {loadingDocs ? (
              <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Caricamento documenti…
              </div>
            ) : documents.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Nessun documento disponibile. Carica un documento nella sezione Documenti.
              </div>
            ) : (<>
              <div ref={docSearchRef} style={{ position: 'relative' }}>
                <label style={labelStyle}>Documento *</label>
                <input
                  value={docSearch}
                  onChange={e => { setDocSearch(e.target.value); setShowDocList(true); }}
                  onFocus={() => setShowDocList(true)}
                  placeholder="Cerca documento…"
                  disabled={generating}
                  style={inputStyle}
                />
                {showDocList && (() => {
                  const q = docSearch.trim().toLowerCase();
                  const filtered = q
                    ? documents.filter(d => (d.title || d.file || '').toLowerCase().includes(q))
                    : documents;
                  if (filtered.length === 0) return null;
                  return (
                    <ul style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                      margin: '2px 0 0', padding: 0, listStyle: 'none',
                      maxHeight: 200, overflowY: 'auto',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
                    }}>
                      {filtered.map(doc => {
                        const label = doc.title || doc.file || '—';
                        const isActive = doc.id === selectedDocId;
                        return (
                          <li
                            key={doc.id}
                            onMouseDown={e => {
                              e.preventDefault();
                              setSelectedDocId(doc.id);
                              setDocSearch(label);
                              setShowDocList(false);
                              setGeneratedQuestions([]);
                              setSelectedGenIdx(new Set());
                              setGenError('');
                            }}
                            style={{
                              padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                              color: isActive ? C.green : C.text,
                              fontWeight: isActive ? 600 : 400,
                              background: isActive ? C.expandBg : 'transparent',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.expandBg}
                            onMouseLeave={e => e.currentTarget.style.background = isActive ? C.expandBg : 'transparent'}
                          >
                            {label}
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </div>

              <div>
                <label style={labelStyle}>Numero di domande</label>
                <input
                  type="number" min={1} max={5}
                  value={numQuestions}
                  onChange={e => {
                    const v = Math.max(1, Math.min(5, parseInt(e.target.value) || 1));
                    setNumQuestions(v);
                    setGeneratedQuestions([]);
                    setSelectedGenIdx(new Set());
                  }}
                  style={{ ...inputStyle, width: 80 }}
                  disabled={generating}
                />
              </div>

              {/* Generated question cards */}
              {generatedQuestions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.textMuted }}>
                    {generatedQuestions.length} domanda/e generata/e — seleziona quelle da salvare:
                  </div>
                  {generatedQuestions.map((q, idx) => {
                    const selected = selectedGenIdx.has(idx);
                    const isEditing = editingGenIdx === idx;
                    return (
                      <div
                        key={idx}
                        style={{
                          border: selected ? `2px solid ${C.greenAccent}` : `1px solid ${C.border}`,
                          borderRadius: 8,
                          padding: 12,
                          background: selected ? 'rgba(168,197,160,0.18)' : C.expandBg,
                          transition: 'border 0.15s, background 0.15s',
                        }}
                      >
                        {isEditing ? (
                          /* ── Inline edit form ── */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Materia</label>
                                <input
                                  value={editGenForm.subject}
                                  onChange={e => setEditGenForm(f => ({ ...f, subject: e.target.value }))}
                                  placeholder="Materia"
                                  style={inputStyle}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Argomento</label>
                                <input
                                  value={editGenForm.topic}
                                  onChange={e => setEditGenForm(f => ({ ...f, topic: e.target.value }))}
                                  placeholder="Argomento"
                                  style={inputStyle}
                                />
                              </div>
                            </div>
                            <div>
                              <label style={labelStyle}>Testo della domanda</label>
                              <textarea
                                value={editGenForm.content}
                                onChange={e => setEditGenForm(f => ({ ...f, content: e.target.value }))}
                                rows={3}
                                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Opzioni</label>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {editGenForm.options.map((opt, oi) => (
                                  <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <input
                                      value={opt}
                                      onChange={e => setEditGenOption(oi, e.target.value)}
                                      style={{ ...inputStyle, flex: 1 }}
                                    />
                                    <button
                                      onClick={() => setEditGenForm(f => { const options = f.options.filter((_, i) => i !== oi); return { ...f, options: options.length ? options : [''] }; })}
                                      style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, flexShrink: 0 }}
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  onClick={() => setEditGenForm(f => ({ ...f, options: [...f.options, ''] }))}
                                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: `1px dashed ${C.border}`, borderRadius: 7, cursor: 'pointer', color: C.textMuted, fontFamily: font, fontSize: 12 }}
                                >
                                  <Plus size={11} /> Aggiungi opzione
                                </button>
                              </div>
                            </div>
                            <div>
                              <label style={labelStyle}>Risposta corretta</label>
                              <select
                                value={editGenForm.correct_answer}
                                onChange={e => setEditGenForm(f => ({ ...f, correct_answer: e.target.value }))}
                                style={{ ...inputStyle, cursor: 'pointer' }}
                              >
                                {editGenForm.options.filter(o => o.trim()).map((o, i) => <option key={i} value={o}>{o}</option>)}
                              </select>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => setEditingGenIdx(null)}
                                style={{ padding: '5px 14px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, cursor: 'pointer', color: C.textMuted, fontFamily: font, fontSize: 12 }}
                              >
                                Annulla
                              </button>
                              <button
                                onClick={confirmEditGen}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', background: C.green, border: 'none', borderRadius: 7, cursor: 'pointer', color: '#FFF', fontFamily: font, fontSize: 12, fontWeight: 500 }}
                              >
                                <Check size={12} /> Conferma
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Read view ── */
                          <div
                            onClick={() => toggleGenIdx(idx)}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}
                          >
                            <input
                              type="checkbox"
                              readOnly
                              checked={selected}
                              style={{ marginTop: 2, accentColor: C.green, flexShrink: 0 }}
                            />
                            <div style={{ flex: 1 }}>
                              {(q.subject || q.topic) && (
                                <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 5 }}>
                                  {[q.subject, q.topic].filter(Boolean).join(' · ')}
                                </div>
                              )}
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 6, lineHeight: 1.5 }}>
                                {q.content}
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {q.options.map((opt, oi) => (
                                  <li key={oi} style={{
                                    fontSize: 12,
                                    color: opt === q.correct_answer ? C.greenLight : C.textBody,
                                    fontWeight: opt === q.correct_answer ? 600 : 400,
                                  }}>
                                    {opt}{opt === q.correct_answer ? ' ✓' : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); openEditGen(idx); }}
                              title="Modifica"
                              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', color: C.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, flexShrink: 0 }}
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {genError && (
                <div style={{ background: C.error.bg, border: `1px solid ${C.error.border}`, color: C.error.text, fontSize: 13, borderRadius: 8, padding: '10px 14px' }}>
                  {genError}
                </div>
              )}
            </>)}
          </>)}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 24px', borderTop: `1px solid ${C.borderLight}` }}>
          <button onClick={onClose} disabled={isBusy}
            style={{ padding: '8px 18px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, cursor: isBusy ? 'not-allowed' : 'pointer', color: C.textMuted, fontFamily: font, fontSize: 13, opacity: isBusy ? 0.5 : 1 }}>
            Annulla
          </button>

          {mode === 'manual' && (
            <button onClick={handleSubmit} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: C.green, border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', color: '#FFF', fontFamily: font, fontSize: 13, fontWeight: 500, opacity: saving ? 0.8 : 1 }}>
              {saving && <span style={spinnerStyle} />}
              {saving ? 'Salvataggio…' : 'Salva'}
            </button>
          )}

          {mode === 'generate' && !loadingDocs && documents.length > 0 && (
            generatedQuestions.length === 0 ? (
              <button onClick={handleGenerate} disabled={generating || !selectedDocId}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: C.green, border: 'none', borderRadius: 8, cursor: (generating || !selectedDocId) ? 'not-allowed' : 'pointer', color: '#FFF', fontFamily: font, fontSize: 13, fontWeight: 500, opacity: (generating || !selectedDocId) ? 0.8 : 1 }}>
                {generating && <span style={spinnerStyle} />}
                {generating ? 'Generazione in corso…' : 'Genera'}
              </button>
            ) : (
              <button onClick={handleSaveGenerated} disabled={savingGenerated || selectedGenIdx.size === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: C.green, border: 'none', borderRadius: 8, cursor: (savingGenerated || selectedGenIdx.size === 0) ? 'not-allowed' : 'pointer', color: '#FFF', fontFamily: font, fontSize: 13, fontWeight: 500, opacity: (savingGenerated || selectedGenIdx.size === 0) ? 0.8 : 1 }}>
                {savingGenerated && <span style={spinnerStyle} />}
                {savingGenerated ? 'Salvataggio…' : selectedGenIdx.size === 1 ? 'Salva domanda' : `Salva ${selectedGenIdx.size} domande`}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
