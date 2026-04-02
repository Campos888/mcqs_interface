import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getExpandedRowModel,
  flexRender,
} from '@tanstack/react-table';
import { BookOpen, LogOut, Search, RefreshCw, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
  bg:         '#F5F0E8',
  surface:    '#FEFCF7',
  border:     '#DDD5C2',
  borderLight:'#EDE8DC',
  headerBg:   '#F0EBE0',
  expandBg:   '#F8F5EF',
  green:      '#2C3E2D',
  greenLight: '#3A5C3C',
  greenText:  '#D4E8D0',
  greenAccent:'#A8C5A0',
  text:       '#1C2B1D',
  textMuted:  '#7A7060',
  textFaint:  '#9A9080',
  textBody:   '#5A5040',
  dot:        '#B8AD9A',
  error:      { bg: '#F7EDE6', border: '#E8C8B8', text: '#8A3A1A' },
};

const font = "'DM Sans', sans-serif";
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

function ExpandedRow({ row }) {
  const q = row.original;
  return (
    <tr>
      <td colSpan={4} style={{ background: C.expandBg, borderBottom: `1px solid ${C.border}`, padding: 0 }}>
        <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>

          {/* Testo completo */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 500, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 0 }}>
              Testo completo
            </p>
            <p style={{ fontSize: 14, color: C.text, lineHeight: 1.7, margin: 0 }}>
              {q.content || '—'}
            </p>
          </div>

          {/* Opzioni */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 500, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 0 }}>
              Opzioni
            </p>
            <JsonItems value={q.options} />
          </div>

          {/* Risposta corretta */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 500, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 0 }}>
              Risposta corretta
            </p>
            <JsonItems value={q.correct_answer} />
          </div>

        </div>
      </td>
    </tr>
  );
}

function SortIcon({ column }) {
  const sorted = column.getIsSorted();
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', marginLeft: 4, verticalAlign: 'middle', gap: 1 }}>
      <ChevronUp size={10} style={{ color: sorted === 'asc' ? C.green : C.dot }} />
      <ChevronDown size={10} style={{ color: sorted === 'desc' ? C.green : C.dot }} />
    </span>
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

// ── Componente principale ─────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting]   = useState([]);
  const [expanded, setExpanded] = useState({});
  const navigate = useNavigate();
  const user = pb.authStore.model;

  async function loadQuestions() {
    setLoading(true); setError('');
    try {
      const records = await pb.collection('Question').getFullList({ sort: '-created' });
      setData(records);
    } catch {
      setError('Errore nel caricamento delle domande.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadQuestions(); }, []);

  // ── Definizione colonne ──
  const columns = useMemo(() => [
    {
      id: 'expander',
      header: '',
      size: 36,
      enableSorting: false,
      cell: ({ row }) => (
        <ChevronRight size={14} style={{ transform: row.getIsExpanded() ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: row.getIsExpanded() ? C.green : C.textMuted }} />
      ),
    },
    {
      accessorKey: 'matter',
      header: 'Materia',
      size: 140,
      cell: ({ getValue }) => (
        <span style={{ fontWeight: 500, color: C.text, fontSize: 13 }}>{getValue() || '—'}</span>
      ),
    },
    {
      accessorKey: 'bloom_level',
      header: 'Livello Bloom',
      size: 130,
      cell: ({ getValue }) => <BloomBadge level={getValue()} />,
    },
    {
      accessorKey: 'content',
      header: 'Anteprima contenuto',
      enableSorting: false,
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12.5, color: C.textBody, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {getValue() || '—'}
        </span>
      ),
    },
  ], []);

  // ── Istanza tabella ──
  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting, expanded },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  function handleLogout() { pb.authStore.clear(); navigate('/login'); }

  const { pageIndex, pageSize } = table.getState().pagination;
  const totalFiltered = table.getFilteredRowModel().rows.length;

  // ── Render ──
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        .tbl-row { cursor: pointer; transition: background 0.1s; }
        .tbl-row:hover > td { background: #EDE8DC !important; }
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
              {totalFiltered} domande{globalFilter ? ' trovate' : ' totali'} · clicca una riga per espanderla
            </p>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textFaint }} />
              <input
                value={globalFilter ?? ''}
                onChange={e => setGlobalFilter(e.target.value)}
                placeholder="Cerca per materia, contenuto, livello…"
                style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px 8px 32px', fontSize: 13, color: C.text, fontFamily: font, outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#5C7A5E'}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>

            {/* Righe per pagina */}
            <select
              value={pageSize}
              onChange={e => table.setPageSize(Number(e.target.value))}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, color: C.textMuted, fontFamily: font, cursor: 'pointer', outline: 'none' }}
            >
              {[10, 20, 50].map(n => <option key={n} value={n}>{n} per pagina</option>)}
            </select>

            <button onClick={loadQuestions} title="Aggiorna"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', color: C.textMuted }}>
              <RefreshCw size={14} />
            </button>
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
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id}>
                      {hg.headers.map(header => (
                        <th key={header.id}
                          onClick={header.column.getToggleSortingHandler()}
                          style={{
                            padding: '10px 14px', textAlign: 'left',
                            fontSize: 10.5, fontWeight: 500, color: C.textMuted,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            borderBottom: `1px solid ${C.border}`, background: C.headerBg,
                            whiteSpace: 'nowrap', userSelect: 'none',
                            cursor: header.column.getCanSort() ? 'pointer' : 'default',
                            width: header.column.getSize(),
                          }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && <SortIcon column={header.column} />}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: C.textFaint }}>
                        <span style={{ display: 'inline-block', width: 16, height: 16, border: `2px solid ${C.border}`, borderTopColor: '#5C7A5E', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 8, verticalAlign: 'middle' }} />
                        Caricamento…
                      </td>
                    </tr>
                  ) : table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: C.textFaint, fontSize: 13 }}>
                        Nessuna domanda trovata.
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.flatMap(row => {
                      const isEven = row.index % 2 === 0;
                      const rowBg = isEven ? 'transparent' : '#FAF7F2';
                      return [
                        <tr key={row.id} className="tbl-row"
                          onClick={row.getToggleExpandedHandler()}
                          style={{ borderBottom: `1px solid ${C.borderLight}` }}
                        >
                          {row.getVisibleCells().map(cell => (
                            <td key={cell.id} style={{ padding: '11px 14px', verticalAlign: 'middle', background: rowBg }}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>,
                        row.getIsExpanded() && (
                          <ExpandedRow key={`${row.id}-expanded`} row={row} />
                        ),
                      ];
                    })
                  )}
                </tbody>

              </table>
            </div>
          </div>

          {/* ── Paginazione ── */}
          {!loading && totalFiltered > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.textFaint }}>
                Pagina {pageIndex + 1} di {table.getPageCount()} · {totalFiltered} risultati
              </span>

              <div style={{ display: 'flex', gap: 4 }}>
                <IconBtn onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} title="Prima pagina">
                  <ChevronsLeft size={13} />
                </IconBtn>
                <IconBtn onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} title="Pagina precedente">
                  <ChevronLeft size={13} />
                </IconBtn>
                <IconBtn onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} title="Pagina successiva">
                  <ChevronRight size={13} />
                </IconBtn>
                <IconBtn onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()} title="Ultima pagina">
                  <ChevronsRight size={13} />
                </IconBtn>
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  );
}
