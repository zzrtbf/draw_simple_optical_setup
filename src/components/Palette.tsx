import { useMemo, useState } from 'react';
import { CATALOG, CATEGORIES, type CategoryId } from '../model/catalog';
import { LIBRARY } from '../generated/library';
import { useEditor } from '../store';
import { IconBeam, IconBox, IconText } from './Icons';

const thumbCache = new Map<string, string>();

function thumbUrl(key: string): string {
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const shape = LIBRARY[key];
  if (!shape) return '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${shape.w} ${shape.h}" width="${shape.w}" height="${shape.h}">${shape.svg}</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  thumbCache.set(key, url);
  return url;
}

export function Palette() {
  const addLib = useEditor((s) => s.addLib);
  const addBox = useEditor((s) => s.addBox);
  const addText = useEditor((s) => s.addText);
  const setTool = useEditor((s) => s.setTool);
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Partial<Record<CategoryId, boolean>>>({});

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CATEGORIES.map((cat) => ({
      ...cat,
      items: CATALOG.filter(
        (c) =>
          c.cat === cat.id &&
          (!needle || `${c.name} ${c.tags} ${c.key}`.toLowerCase().includes(needle)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  return (
    <aside className="palette">
      <div className="palette-head">
        <div className="brand">
          <img className="brand-mark" src="./icon.svg" alt="" width={16} height={16} />
          <span className="brand-text">OPTICAL BENCH</span>
        </div>
        <input
          className="search"
          placeholder="Search parts…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="quick-row">
          <button className="quick" onClick={() => addBox()} title="Add a custom rounded box">
            <IconBox size={14} />
            <span>Custom part</span>
          </button>
          <button className="quick" onClick={() => addText()} title="Add a text label">
            <IconText size={14} />
            <span>Text</span>
          </button>
          <button
            className="quick"
            onClick={() => setTool('beam')}
            title="Draw a beam (B)"
          >
            <IconBeam size={14} />
            <span>Beam</span>
          </button>
        </div>
      </div>

      <div className="palette-list">
        {groups.map((g) => {
          const isClosed = closed[g.id] && !q;
          return (
            <div className="cat" key={g.id}>
              <button
                className="cat-head"
                onClick={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))}
              >
                <span className={`chev${isClosed ? ' is-closed' : ''}`}>▾</span>
                {g.label}
                <span className="cat-count">{g.items.length}</span>
              </button>
              {!isClosed && (
                <div className="cat-grid">
                  {g.items.map((c) => (
                    <button
                      key={c.key}
                      className="pal-item"
                      onClick={() => addLib(c.key)}
                      title={`${c.name} — ${c.w} × ${c.h} mm`}
                    >
                      <span className="pal-thumb">
                        <img src={thumbUrl(c.key)} alt="" draggable={false} />
                      </span>
                      <span className="pal-name">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && <div className="empty-hint">No part matches “{q}”.</div>}
      </div>

      <div className="palette-foot">
        <span>Artwork: ComponentLibrary</span>
        <span>© A. Franzen · CC BY-NC 3.0</span>
      </div>
    </aside>
  );
}
