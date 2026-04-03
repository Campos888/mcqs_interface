# Portale Docenti — Specifiche progetto

## Stack tecnologico

| Layer    | Tecnologia                          |
|----------|-------------------------------------|
| Backend  | PocketBase (`http://127.0.0.1:8090`) |
| Frontend | React + Vite                        |
| Routing  | React Router DOM                    |
| Icone    | lucide-react                        |
| Stile    | Inline CSS (nessuna libreria UI)    |

---

## Struttura file frontend

```
src/
  lib/
    pocketbase.js          # Istanza PocketBase singleton
  components/
    Login.jsx              # Pagina di login
    Dashboard.jsx          # Pagina principale (domande d'esame)
    ProtectedRoute.jsx     # Guard per rotte autenticate
  App.jsx                  # Router principale
  main.jsx                 # Entry point React
```

**Route:**
- `/login` → `Login`
- `/` → `Dashboard` (protetta da `ProtectedRoute`)
- `*` → redirect a `/`

---

## PocketBase — Collection `Question`

| Campo           | Tipo         | Note                                                                 |
|-----------------|--------------|----------------------------------------------------------------------|
| `id`            | string       | ID univoco generato da PocketBase                                    |
| `subject`       | string       | Materia (ex: "Matematica") — **era `matter` nelle versioni precedenti** |
| `topic`         | string       | Argomento/sottoargomento (ex: "Derivate") — campo aggiunto di recente |
| `content`       | string       | Testo completo della domanda                                         |
| `options`       | JSON (array) | Opzioni di risposta                                                  |
| `correct_answer`| string       | Una delle opzioni (stringa, non array)                               |
| `bloom_level`   | string       | `remember`\|`understand`\|`apply`\|`analyze`\|`evaluate`\|`create` — oppure `""` |
| `owner`         | string       | ID utente autenticato (relation → collection `users`)                |

**Operazioni PocketBase usate:**
```js
// Caricamento
pb.collection('Question').getFullList({ sort: '-created' })

// Cancellazione
pb.collection('Question').delete(id)

// Creazione
pb.collection('Question').create({
  subject, topic, content,
  options,        // array di stringhe non vuote
  correct_answer, // stringa singola
  bloom_level,    // può essere ""
  owner: pb.authStore.model.id,
})

// Modifica
pb.collection('Question').update(id, {
  subject, topic, content,
  options,        // array di stringhe non vuote
  correct_answer, // stringa singola
  bloom_level,    // può essere ""
  // owner NON va aggiornato
})
```

**Nota:** PocketBase JS SDK deserializza automaticamente i campi JSON (es. `options`) in oggetti/array JavaScript. Non serve `JSON.parse` sui record restituiti.

---

## Dashboard.jsx — Comportamento attuale

### Struttura tabella a tre livelli di espansione

```
▶ Matematica                          (livello 1 — subject)
    ▶ Derivate                        (livello 2 — topic)
        ☐ ▶ Qual è la derivata di...  (livello 3 — domanda)
               Testo completo         (livello 4 — dettaglio, espanso al click)
               Opzioni
               Risposta corretta
```

**Gerarchia visiva:** indentazione (`paddingLeft`) crescente per livello.

### Stato React

```js
const [data, setData]                     = useState([]);
const [loading, setLoading]               = useState(true);
const [error, setError]                   = useState('');
const [globalFilter, setGlobalFilter]     = useState('');
const [expandedSubjects,  setExpandedSubjects]  = useState(new Set()); // chiave: subject string
const [expandedTopics,    setExpandedTopics]    = useState(new Set()); // chiave: `${subject}::${topic}`
const [expandedQuestions, setExpandedQuestions] = useState(new Set()); // chiave: question id
const [selectedIds,       setSelectedIds]       = useState(new Set()); // chiave: question id
const [showDeleteModal, setShowDeleteModal]     = useState(false);
const [deleting, setDeleting]                   = useState(false);
const [showAddModal, setShowAddModal]           = useState(false);
const [openMenuId, setOpenMenuId]               = useState(null);   // id domanda con menu aperto
const [editQuestion, setEditQuestion]           = useState(null);   // record domanda in modifica
const [page, setPage]                     = useState(0);
const [pageSize, setPageSize]             = useState(10);
```

### Selezione e cancellazione

- Checkbox su ogni riga domanda (livello 3)
- `e.stopPropagation()` sulla checkbox per non triggerare l'espansione della riga
- Pulsante `Elimina N domande` con icona `Trash2` nella toolbar, visibile solo se `selectedIds.size > 0`
- Modale di conferma con pulsanti Annulla / Elimina
- Cancellazione in parallelo:
  ```js
  await Promise.all([...selectedIds].map(id => pb.collection('Question').delete(id)));
  ```
- Dopo la cancellazione: svuotare `selectedIds`, chiudere la modale, ricaricare i dati

### Ricerca e paginazione

- `globalFilter` filtra per `subject`, `topic`, `content`, `bloom_level`
- La paginazione opera sulle materie (livello 1)
- Il refresh (`RefreshCw`) ricarica i dati e svuota la selezione
- Il pulsante `+ Aggiungi` (verde `C.green`, icona `Plus`) apre `AddQuestionModal`

---

## Palette colori e stile

```js
const C = {
  bg:          '#F5F0E8',
  surface:     '#FEFCF7',
  border:      '#DDD5C2',
  borderLight: '#EDE8DC',
  headerBg:    '#F0EBE0',
  expandBg:    '#F8F5EF',
  green:       '#2C3E2D',
  greenLight:  '#3A5C3C',
  greenAccent: '#A8C5A0',
  text:        '#1C2B1D',
  textMuted:   '#7A7060',
  textFaint:   '#9A9080',
  textBody:    '#5A5040',
  dot:         '#B8AD9A',
  error:       { bg: '#F7EDE6', border: '#E8C8B8', text: '#8A3A1A' },
};

const font  = "'DM Sans', sans-serif";   // Google Fonts
const serif = 'Lora, serif';             // Google Fonts

const BLOOM_STYLES = {
  remember:   { background: '#E6EEF6', color: '#2A5C8A' },
  understand: { background: '#E6F2ED', color: '#1F6B4E' },
  apply:      { background: '#EFF5E6', color: '#3F6B18' },
  analyze:    { background: '#FBF2DC', color: '#7A5010' },
  evaluate:   { background: '#F7EDE6', color: '#8A3A1A' },
  create:     { background: '#F3E8F0', color: '#6A2860' },
};
```

**Azioni distruttive:** `#8A3A1A` (testo), `#F7EDE6` (sfondo), `#E8C8B8` (bordo).

---

## Componenti / helper presenti in Dashboard.jsx

| Nome             | Tipo     | Descrizione                                                  |
|------------------|----------|--------------------------------------------------------------|
| `BloomBadge`        | componente | Badge colorato per il livello Bloom                                    |
| `JsonItems`         | componente | Renderizza un array JSON come lista puntata                            |
| `QuestionDetail`    | componente | `<tr>` con testo completo, opzioni e risposta corretta                 |
| `IconBtn`           | componente | Bottone icona con bordo (usato nella paginazione)                      |
| `SuggestInput`      | componente | Input testo + dropdown suggerimenti filtrati per sottostringa; chiude al click fuori (useRef + mousedown); props: `label`, `value`, `onChange`, `suggestions` |
| `AddQuestionModal`  | componente | Modale creazione domanda; props: `data`, `onClose`, `onSaved`; gestisce validazione e chiamata `pb.collection('Question').create(...)` |
| `EditQuestionModal` | componente | Modale modifica domanda; props: `question`, `data`, `onClose`, `onSaved`; pre-popola il form dal record, chiama `pb.collection('Question').update(id, ...)` |
| `thStyle(w?)`       | funzione   | Restituisce lo stile inline per le celle `<th>`                        |

---

## Prompt per modifiche future

### Aggiungere un nuovo livello o campo

Quando modifichi la struttura della tabella tieni presente:
- Lo stato `expandedSubjects` / `expandedTopics` usa chiavi stringa; se aggiungi un livello, scegli una chiave composita univoca (es. `subject::topic::subtopic`)
- La paginazione è sulle materie (`groupedData.length`); se sposti il livello di paginazione, aggiorna `totalGroups` e `pagedGroups`
- I campi del record PocketBase si leggono direttamente da `q.nomeCampo`

### Normalizzazione chiavi di raggruppamento

- Applicare sempre `.trim()` a `subject` e `topic` prima di usarli come chiavi nel `useMemo` di raggruppamento
- Previene duplicati causati da spazi iniziali/finali nei dati PocketBase
- Pattern:
  ```js
  const subject = (q.subject || 'Senza materia').trim();
  const topic   = (q.topic   || 'Senza argomento').trim();
  ```

### Struttura raggruppamento attesa

```js
// Struttura dati derivata (useMemo)
[
  {
    subject: 'Matematica',
    topics: [
      {
        topic: 'Derivate',
        questions: [ /* record PocketBase */ ]
      }
    ]
  }
]
```

### Aggiungere un'azione bulk (es. esporta, modifica)

1. Aggiungere il pulsante nella toolbar condizionato a `selectedIds.size > 0`
2. Raccogliere i record completi con: `data.filter(q => selectedIds.has(q.id))`
3. Gestire la logica in una funzione asincrona separata con stato `loading` dedicato

---

## Pattern riutilizzabili

### Dropdown suggerimenti (SuggestInput)
- `useRef` sul wrapper + listener `mousedown` su `document` per chiudere al click fuori
- Filtra per sottostringa case-insensitive; mostra solo se `value.trim()` non è vuoto
- `onMouseDown={e => e.preventDefault()}` sull'`<li>` per evitare `onBlur` prima del click

### Modale form con validazione
- Stato form separato (`initialForm` costante esterna per reset pulito)
- Validazione sincrona pre-submit → `setFormError(msg); return`
- Errore inline con stile `C.error`; modale non si chiude su errore
- Pulsante Salva disabilitato + spinner durante `saving`; testo "Salvataggio…"
- Overlay chiudibile al click (se non `saving`); `e.stopPropagation()` sul contenuto
- Larghezza: `min(600px, 90vw)`; body scrollabile con `overflowY: auto`

### Correct answer sincronizzata con options
- Usare `useEffect` su `[form.options]` **solo in `AddQuestionModal`** (dove `correct_answer` parte vuoto):
  ```js
  const validOptions = form.options.filter(o => o.trim() !== '');
  useEffect(() => {
    if (form.correct_answer && !validOptions.includes(form.correct_answer))
      setForm(f => ({ ...f, correct_answer: '' }));
  }, [form.options]);
  ```
- **Non usare questo `useEffect` in `EditQuestionModal`**: girerebbe al mount e svuoterebbe il valore pre-popolato. La validazione al submit è sufficiente a catturare risposte non più valide.

### Menu a 3 puntini per domanda (kebab menu)
- Stato: `openMenuId` (id domanda con menu aperto) — un solo menu aperto alla volta
- Chiusura: `mousedown` globale su `document` → `setOpenMenuId(null)`; il wrapper del menu usa `onMouseDown={e => e.stopPropagation()}` per non chiudersi al click interno
- Voci: **Modifica** (`Pencil`) → `setEditQuestion(q)`, **Elimina** (`Trash2`) → `setSelectedIds(new Set([q.id])); setShowDeleteModal(true)`, **Classifica** (`Tag`) → placeholder no-op
- "Elimina" da menu riusa il modale di conferma bulk esistente con selezione singola

### `correct_answer` come stringa plain in `QuestionDetail`
- Non usare `JsonItems` per `correct_answer`: è una stringa semplice, non un array
- Renderizzare direttamente: `{question.correct_answer || '—'}`
- `JsonItems` va usato solo per `options` (array JSON)

### Topic contestuale per subject
- I suggerimenti topic si filtrano per match esatto (case-insensitive) sulla subject corrente:
  ```js
  data.filter(q => q.subject.trim().toLowerCase() === subj).map(q => q.topic.trim())
  ```
- Se subject è vuota → array suggerimenti topic vuoto
