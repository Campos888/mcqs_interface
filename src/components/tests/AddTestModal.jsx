import { useState, useEffect, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import pb from '../../lib/pocketbase';
import { C, font, serif } from '../../styles/theme';
import SuggestInput from '../dashboard/SuggestInput';

const initialForm = { description: '', subject: '', topic: '' };

export default function AddTestModal({ onClose, onSaved, data }) {
  const [form, setForm]             = useState(initialForm);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const [warning, setWarning]       = useState('');
  const [questions, setQuestions]   = useState([]);
  const [selectedQIds, setSelectedQIds] = useState(new Set());
  const [qFilter, setQFilter]       = useState('');
  const [loadingQ, setLoadingQ]     = useState(true);

  useEffect(() => {
    pb.collection('Question').getFullList({
      sort: '-created',
      filter: `owner = "${pb.authStore.model.id}"`,
    }).then(recs => setQuestions(recs)).catch(() => {}).finally(() => setLoadingQ(false));
  }, []);

  const subjectSuggestions = useMemo(() => {
    const set = new Set(data.map(d => (d.subject || '').trim()).filter(Boolean));
    return [...set].sort();
  }, [data]);

  const topicSuggestions = useMemo(() => {
    const subj = form.subject.trim().toLowerCase();
    if (!subj) return [];
    const set = new Set(
      data
        .filter(d => (d.subject || '').trim().toLowerCase() === subj)
        .map(d => (d.topic || '').trim())
        .filter(Boolean)
    );
    return [...set].sort();
  }, [data, form.subject]);

  const filteredQuestions = useMemo(() => {
    if (!qFilter.trim()) return questions;
    const q = qFilter.trim().toLowerCase();
    return questions.filter(q_ =>
      q_.subject?.toLowerCase().includes(q) ||
      q_.topic?.toLowerCase().includes(q) ||
      q_.content?.toLowerCase().includes(q)
    );
  }, [questions, qFilter]);

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); setFormError(''); setWarning(''); }

  function toggleQ(id) {
    setSelectedQIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    const description = form.description.trim();
    const subject     = form.subject.trim();
    const topic       = form.topic.trim();

    if (!description) { setFormError('Inserisci un nome per il test.'); return; }
    if (!subject && topic) { setFormError('Inserisci la materia prima di specificare un argomento.'); setWarning(''); return; }

    const warnMsg = !subject && !topic
      ? 'Sicuro di voler salvare il test senza materia e senza argomento?'
      : subject && !topic
        ? 'Sicuro di voler salvare il test senza argomento?'
        : '';
    if (warnMsg && warning !== warnMsg) { setWarning(warnMsg); setFormError(''); return; }

    setSaving(true); setFormError(''); setWarning('');
    try {
      await pb.collection('Test').create({
        description,
        subject,
        topic,
        questions: [...selectedQIds],
        owner: pb.authStore.model.id,
      });
      onSaved();
    } catch {
      setFormError('Errore durante il salvataggio. Riprova.');
      setSaving(false);
    }
  }

  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: C.textMuted, marginBottom: 4 };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,43,29,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: 'min(600px, 90vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', fontFamily: font }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${C.borderLight}` }}>
          <h2 style={{ fontFamily: serif, fontSize: 17, fontWeight: 500, color: C.text, margin: 0 }}>Nuovo test</h2>
          <button onClick={onClose} disabled={saving}
            style={{ background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', color: C.textMuted, padding: 4, display: 'flex', opacity: saving ? 0.4 : 1 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Nome test *</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Es. Verifica Matematica — Derivate"
              style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: C.text, fontFamily: font, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#5C7A5E'}
              onBlur={e => e.target.style.borderColor = C.border}
            />
          </div>

          <SuggestInput label="Materia" value={form.subject} onChange={v => setField('subject', v)} suggestions={subjectSuggestions} />
          <SuggestInput label="Argomento" value={form.topic} onChange={v => setField('topic', v)} suggestions={topicSuggestions} />

          {/* Question selector */}
          <div>
            <label style={labelStyle}>
              Domande
              {selectedQIds.size > 0 && (
                <span style={{ color: C.greenLight, marginLeft: 6 }}>{selectedQIds.size} {selectedQIds.size === 1 ? 'selezionata' : 'selezionate'}</span>
              )}
            </label>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textFaint }} />
              <input
                value={qFilter}
                onChange={e => setQFilter(e.target.value)}
                placeholder="Filtra per materia, argomento, contenuto…"
                style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px 7px 30px', fontSize: 12.5, color: C.text, fontFamily: font, outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#5C7A5E'}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 220, overflowY: 'auto', background: C.bg }}>
              {loadingQ ? (
                <div style={{ padding: 16, textAlign: 'center', color: C.textFaint, fontSize: 13 }}>Caricamento…</div>
              ) : filteredQuestions.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: C.textFaint, fontSize: 13 }}>Nessuna domanda trovata.</div>
              ) : (
                filteredQuestions.map(q => (
                  <label key={q.id}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${C.borderLight}`, cursor: 'pointer', background: selectedQIds.has(q.id) ? C.expandBg : 'transparent' }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedQIds.has(q.id)}
                      onChange={() => toggleQ(q.id)}
                      style={{ marginTop: 2, accentColor: C.green, flexShrink: 0, cursor: 'pointer' }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: C.textBody, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {q.content || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>
                        {[q.subject, q.topic].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
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
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}
