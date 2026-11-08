import { useMemo } from 'react';
import { useEditor } from '../store';
import { useConflictIds } from '../lib/conflicts';
import { CATALOG_BY_KEY } from '../model/catalog';
import { BOARD_PRESETS, BOX_COLORS, type Beam, type Item, type LibItem } from '../model/types';
import {
  beamAngle,
  beamEndFrom,
  beamHalfAngle,
  beamLength,
  fmt,
  labelPoint,
} from '../lib/geom';
import { sampleProject } from '../model/sample';
import { chord, IS_MAC } from '../lib/platform';
import { opticSpec } from '../lib/opticsMap';
import { WAVELENGTH_PRESETS, wavelengthBand, wavelengthLabel, wavelengthToColor } from '../lib/spectrum';
import { toast } from '../lib/toast';
import { IconLock, IconTrash, IconCopy, IconUnlock, IconAlert } from './Icons';
import { NumField, Row, Section, Segmented, Swatches, TextField, Toggle } from './ui';

const round1 = (v: number) => Math.round(v * 10) / 10;

export function Inspector() {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const conflicts = useConflictIds();

  const sel = useMemo(() => new Set(selection), [selection]);
  const items = project.items.filter((i) => sel.has(i.id));
  const beams = project.beams.filter((b) => sel.has(b.id));
  const singleItem = items.length === 1 && beams.length === 0 ? items[0] : null;
  const singleBeam = beams.length === 1 && items.length === 0 ? beams[0] : null;
  const multi = items.length + beams.length > 1;

  return (
    <aside className="inspector">
      {!selection.length && <BoardPanel />}
      {multi && <MultiPanel count={items.length + beams.length} />}
      {singleItem && <ItemPanel item={singleItem} />}
      {singleBeam && <BeamPanel beam={singleBeam} />}
      {conflicts.size > 0 && <ConflictPanel ids={conflicts} />}
    </aside>
  );
}

/* ---------------------------------------------------------------- */

function useCommit() {  return {
    begin: () => useEditor.getState().pushHistory(),
    liveItem: (id: string, patch: Partial<Item>) =>
      useEditor.getState().updateItem(id, patch, false),
    liveBeam: (id: string, patch: Partial<Beam>) =>
      useEditor.getState().updateBeam(id, patch, false),
    commitItem: (id: string, patch: Partial<Item>) => {
      const st = useEditor.getState();
      st.pushHistory();
      st.updateItem(id, patch, false);
    },
    commitBeam: (id: string, patch: Partial<Beam>) => {
      const st = useEditor.getState();
      st.pushHistory();
      st.updateBeam(id, patch, false);
    },
  };
}


/** Light-source / lens / splitter settings, shown only for optical parts. */
function OpticsSection({ item, c }: { item: LibItem; c: ReturnType<typeof useCommit> }) {
  const spec = opticSpec(item.lib);
  if (!spec) return null;

  const isEmitter = spec.role === 'source' || spec.role === 'coupler';
  const isCoupler = spec.role === 'coupler';
  const wavelength = item.wavelength ?? spec.wavelength ?? 633;
  const receive = isCoupler && item.couplerMode === 'in';
  const emitting = item.emit !== false && !receive;

  if (isEmitter) {
    return (
      <Section title={isCoupler ? 'Fiber coupler' : 'Light source'}>
        {isCoupler && (
          <Segmented
            value={item.couplerMode ?? 'out'}
            options={[
              { value: 'out', label: 'Collimate (out)' },
              { value: 'in', label: 'Couple (in)' },
            ]}
            onChange={(v) => c.commitItem(item.id, { couplerMode: v as 'out' | 'in' })}
          />
        )}
        <Toggle
          label="Emit light"
          checked={item.emit !== false}
          onChange={(v) => c.commitItem(item.id, { emit: v })}
        />

        <Row>
          <NumField
            label="&lambda;"
            unit="nm"
            step={1}
            min={200}
            max={3000}
            value={wavelength}
            onFocusDirty={c.begin}
            onChange={(v) => c.commitItem(item.id, { wavelength: Math.round(v) })}
          />
          <div className="field-spacer" />
          <span
            className="wl-swatch"
            title={wavelengthLabel(wavelength)}
            style={{ background: wavelengthToColor(wavelength) }}
          />
        </Row>
        <div className="wl-presets">
          {WAVELENGTH_PRESETS.map((nm) => (
            <button
              key={nm}
              className={Math.round(wavelength) === nm ? 'is-active' : ''}
              onClick={() => c.commitItem(item.id, { wavelength: nm })}
              title={wavelengthLabel(nm)}
            >
              {nm}
            </button>
          ))}
        </div>
        <div className="hint">
          {wavelengthLabel(wavelength)} — {wavelengthBand(wavelength)}.
          {emitting ? '' : ' Not emitting: no light leaves this part.'}
        </div>

        <Row>
          <NumField
            label="&Oslash;"
            unit="mm"
            step={0.1}
            min={0.1}
            max={50}
            value={item.beamDia ?? spec.dia ?? 2}
            onFocusDirty={c.begin}
            onChange={(v) => c.commitItem(item.id, { beamDia: v })}
          />
          <NumField
            label="Opacity"
            step={0.05}
            min={0.1}
            max={1}
            value={item.beamOpacity ?? 0.9}
            onFocusDirty={c.begin}
            onChange={(v) => c.commitItem(item.id, { beamOpacity: v })}
          />
        </Row>
        <div className="hint">
          Emits a collimated beam from the front face along the part&rsquo;s local +x; rotate the part
          to aim it. Parallel to the table, thin-element paraxial model.
        </div>
      </Section>
    );
  }

  if (spec.role === 'lens') {
    const f = item.focal ?? spec.focal ?? 100;
    return (
      <Section title="Thin lens">
        <Row>
          <NumField
            label="f"
            unit="mm"
            step={5}
            value={f}
            onFocusDirty={c.begin}
            onChange={(v) => c.commitItem(item.id, { focal: v === 0 ? 1 : v })}
          />
          <div className="field-spacer" />
          <span className="pill">{f > 0 ? 'converging' : 'diverging'}</span>
        </Row>
        <div className="hint">
          Positive f converges, negative diverges. 1/q&prime; = 1/q &minus; 1/f, so the beam diameter
          follows the Gaussian envelope as it propagates.
        </div>
      </Section>
    );
  }

  if (spec.role === 'splitter') {
    return (
      <Section title="Beamsplitter">
        <div className="hint">
          Splits into a transmitted and a reflected arm, both inheriting the incoming diameter and
          divergence. Coating runs along the drawn diagonal; rotate the part to change which way the
          reflected arm leaves.
        </div>
      </Section>
    );
  }

  if (spec.role === 'mirror' || spec.role === 'detector' || spec.role === 'blocker') {
    return (
      <Section title={spec.role === 'mirror' ? 'Mirror' : spec.role === 'detector' ? 'Detector' : 'Beam dump'}>
        <div className="hint">
          {spec.role === 'mirror'
            ? 'Flat mirror: the beam leaves at the reflection angle. Rotate to fold the path.'
            : spec.role === 'detector'
              ? 'Absorbs the beam: propagation stops here.'
              : 'Absorbs the beam: propagation stops here.'}
        </div>
      </Section>
    );
  }

  return null;
}

function ItemPanel({ item }: { item: Item }) {
  const c = useCommit();
  const title =
    item.kind === 'lib'
      ? (CATALOG_BY_KEY.get(item.lib)?.name ?? item.lib)
      : item.kind === 'text'
        ? 'Text label'
        : 'Custom part';

  const setRot = (rot: number) => c.commitItem(item.id, { rot });

  return (
    <>
      <div className="insp-title">
        <span className="dot" />
        <h2>{title}</h2>
        <button
          className="icon-btn"
          title={item.locked ? 'Unlock' : 'Lock position and size'}
          onClick={() => c.commitItem(item.id, { locked: !item.locked })}
        >
          {item.locked ? <IconLock size={14} /> : <IconUnlock size={14} />}
        </button>
      </div>

      <Section title="Position">
        <Row>
          <NumField
            label="X"
            unit="mm"
            value={item.x}
            onFocusDirty={c.begin}
            onChange={(v) => c.liveItem(item.id, { x: v })}
          />
          <NumField
            label="Y"
            unit="mm"
            value={item.y}
            onFocusDirty={c.begin}
            onChange={(v) => c.liveItem(item.id, { y: v })}
          />
        </Row>
        {item.kind !== 'text' && (
          <Row>
            <NumField
              label="W"
              unit="mm"
              min={1}
              value={item.w}
              onFocusDirty={c.begin}
              onChange={(v) => c.liveItem(item.id, { w: v } as Partial<Item>)}
            />
            <NumField
              label="H"
              unit="mm"
              min={1}
              value={item.h}
              onFocusDirty={c.begin}
              onChange={(v) => c.liveItem(item.id, { h: v } as Partial<Item>)}
            />
          </Row>
        )}
        {item.kind === 'text' && (
          <Row>
            <NumField
              label="Size"
              unit="mm"
              min={0.5}
              value={item.size}
              onFocusDirty={c.begin}
              onChange={(v) => c.liveItem(item.id, { size: v } as Partial<Item>)}
            />
            <div className="field-spacer" />
          </Row>
        )}
        <Row>
          <NumField
            label="Rot"
            unit="deg"
            value={item.rot}
            onFocusDirty={c.begin}
            onChange={(v) => c.liveItem(item.id, { rot: v })}
          />
          <div className="quick-rot">
            {[0, 45, 90, 180].map((r) => (
              <button key={r} onClick={() => setRot(r)} title={`Rotate to ${r} deg`}>
                {r}&deg;
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {item.kind === 'lib' && <OpticsSection item={item} c={c} />}

      {item.kind === 'text' ? (
        <Section title="Text">
          <TextField
            label="Content"
            multiline
            value={item.text}
            onChange={(v) => c.liveItem(item.id, { text: v } as Partial<Item>)}
          />
          <Segmented
            value={item.align}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={(v) => c.commitItem(item.id, { align: v } as Partial<Item>)}
          />
          <Swatches
            colors={['#cfe0f0', '#8ea4bd', '#38e1c4', '#ffc23d', '#ff5b76']}
            value={item.color}
            onChange={(color) => c.commitItem(item.id, { color } as Partial<Item>)}
          />
        </Section>
      ) : (
        <Section title="Label">
          <TextField
            label="Text"
            value={item.label}
            placeholder="e.g. M1"
            onChange={(v) => c.liveItem(item.id, { label: v })}
          />
          <Toggle
            label="Show label"
            checked={item.showLabel}
            onChange={(v) => c.commitItem(item.id, { showLabel: v })}
          />
          {item.kind === 'lib' && item.showLabel && (
            <>
              <Row>
                <NumField
                  label="X"
                  unit="mm"
                  value={item.labelOffset ? item.x + item.labelOffset.x : labelPoint(item).x}
                  onFocusDirty={c.begin}
                  onChange={(v) =>
                    c.liveItem(item.id, {
                      labelOffset: {
                        x: v - item.x,
                        y: (item.labelOffset?.y ?? labelPoint(item).y - item.y),
                      },
                    })
                  }
                />
                <NumField
                  label="Y"
                  unit="mm"
                  value={item.labelOffset ? item.y + item.labelOffset.y : labelPoint(item).y}
                  onFocusDirty={c.begin}
                  onChange={(v) =>
                    c.liveItem(item.id, {
                      labelOffset: {
                        x: item.labelOffset?.x ?? labelPoint(item).x - item.x,
                        y: v - item.y,
                      },
                    })
                  }
                />
              </Row>
              <div className="btn-row">
                <button onClick={() => c.commitItem(item.id, { labelOffset: null })}>
                  Auto label position
                </button>
              </div>
              <div className="hint">Drag the label on the canvas to place it freely.</div>
            </>
          )}
          {item.kind === 'box' && (
            <Swatches
              colors={BOX_COLORS}
              value={item.color}
              onChange={(color) => c.commitItem(item.id, { color } as Partial<Item>)}
            />
          )}
        </Section>
      )}

      <Section title="Object">
        <div className="btn-row">
          <button onClick={() => useEditor.getState().reorder('front')}>Front</button>
          <button onClick={() => useEditor.getState().reorder('back')}>Back</button>
          <button onClick={() => useEditor.getState().reorder('up')}>Up</button>
          <button onClick={() => useEditor.getState().reorder('down')}>Down</button>
        </div>
        <Toggle
          label="Snap to hole grid"
          checked={item.snap}
          onChange={(v) => c.commitItem(item.id, { snap: v })}
        />
        <Toggle
          label="Collision check"
          checked={item.collide}
          onChange={(v) => c.commitItem(item.id, { collide: v })}
        />
        <div className="btn-row">
          <button onClick={() => useEditor.getState().duplicateSelection()}>
            <IconCopy size={13} /> Duplicate
          </button>
          <button className="danger" onClick={() => useEditor.getState().deleteSelection()}>
            <IconTrash size={13} /> Delete
          </button>
        </div>
      </Section>
    </>
  );
}

function BeamPanel({ beam }: { beam: Beam }) {
  const c = useCommit();
  const L = beamLength(beam);
  const half = beamHalfAngle(beam);

  return (
    <>
      <div className="insp-title">
        <span className="dot beam" />
        <h2>Beam</h2>
        <button
          className="icon-btn"
          title={beam.locked ? 'Unlock' : 'Lock'}
          onClick={() => c.commitBeam(beam.id, { locked: !beam.locked })}
        >
          {beam.locked ? <IconLock size={14} /> : <IconUnlock size={14} />}
        </button>
      </div>

      <Section title="Geometry">
        <Row>
          <NumField label="X1" unit="mm" value={beam.x1} onFocusDirty={c.begin} onChange={(v) => c.liveBeam(beam.id, { x1: v })} />
          <NumField label="Y1" unit="mm" value={beam.y1} onFocusDirty={c.begin} onChange={(v) => c.liveBeam(beam.id, { y1: v })} />
        </Row>
        <Row>
          <NumField label="X2" unit="mm" value={beam.x2} onFocusDirty={c.begin} onChange={(v) => c.liveBeam(beam.id, { x2: v })} />
          <NumField label="Y2" unit="mm" value={beam.y2} onFocusDirty={c.begin} onChange={(v) => c.liveBeam(beam.id, { y2: v })} />
        </Row>
        <Row>
          <NumField
            label="Length"
            unit="mm"
            min={0.5}
            step={1}
            value={L}
            onFocusDirty={c.begin}
            onChange={(v) => {
              const p = beamEndFrom(beam, Math.max(v, 0.5), beamAngle(beam));
              c.liveBeam(beam.id, { x2: round1(p.x), y2: round1(p.y) });
            }}
          />
          <NumField
            label="Angle"
            unit="deg"
            step={1}
            value={round1(beamAngle(beam))}
            onFocusDirty={c.begin}
            onChange={(v) => {
              const p = beamEndFrom(beam, Math.max(L, 0.5), v);
              c.liveBeam(beam.id, { x2: round1(p.x), y2: round1(p.y) });
            }}
          />
        </Row>
        <div className="readout">
          <span>Length</span>
          <b>{fmt(L)} mm</b>
          <span>Half angle</span>
          <b>{fmt(half, 2)} deg</b>
        </div>
      </Section>

      <Section title="Aperture">
        <Row>
          <NumField
            label="Start"
            unit="mm"
            min={0}
            step={0.5}
            value={beam.w1}
            onFocusDirty={c.begin}
            onChange={(v) => c.liveBeam(beam.id, { w1: v })}
          />
          <NumField
            label="End"
            unit="mm"
            min={0}
            step={0.5}
            value={beam.w2}
            onFocusDirty={c.begin}
            onChange={(v) => c.liveBeam(beam.id, { w2: v })}
          />
        </Row>
        <div className="hint">
          {beam.w1 === beam.w2 ? 'Collimated' : beam.w2 > beam.w1 ? 'Diverging' : 'Focusing'} beam.
          Diameter is measured across the beam; equal start and end values give a parallel beam.
        </div>
      </Section>

      <Section title="Appearance">
        <Row>
          <NumField
            label="&lambda;"
            unit="nm"
            step={1}
            min={200}
            max={3000}
            value={beam.wavelength ?? 633}
            onFocusDirty={c.begin}
            onChange={(v) => {
              const nm = Math.round(v);
              c.commitBeam(beam.id, { wavelength: nm, color: wavelengthToColor(nm) });
            }}
          />
          <div className="field-spacer" />
          <span
            className="wl-swatch"
            title={wavelengthLabel(beam.wavelength ?? 633)}
            style={{ background: beam.color }}
          />
        </Row>
        <div className="wl-presets">
          {WAVELENGTH_PRESETS.map((nm) => (
            <button
              key={nm}
              className={Math.round(beam.wavelength ?? -1) === nm ? 'is-active' : ''}
              onClick={() => c.commitBeam(beam.id, { wavelength: nm, color: wavelengthToColor(nm) })}
              title={wavelengthLabel(nm)}
            >
              {nm}
            </button>
          ))}
        </div>
        <div className="hint">
          The beam colour follows the wavelength. Beams saved before v1.3.2 keep their own colour
          until you pick a wavelength here.
        </div>
        <label className="slider-field">
          <span className="nf-label">Opacity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={beam.opacity}
            onChange={(e) => c.liveBeam(beam.id, { opacity: Number(e.target.value) })}
            onPointerDown={c.begin}
          />
          <span className="nf-unit">{Math.round(beam.opacity * 100)}%</span>
        </label>
        <TextField
          label="Label"
          value={beam.label}
          placeholder="e.g. 1064 nm"
          onChange={(v) => c.liveBeam(beam.id, { label: v })}
        />
        <Toggle
          label="Show label"
          checked={beam.showLabel}
          onChange={(v) => c.commitBeam(beam.id, { showLabel: v })}
        />
        <Toggle
          label="Snap to hole grid"
          checked={beam.snap}
          onChange={(v) => c.commitBeam(beam.id, { snap: v })}
        />
        <div className="btn-row">
          <button onClick={() => useEditor.getState().duplicateSelection()}>
            <IconCopy size={13} /> Duplicate
          </button>
          <button className="danger" onClick={() => useEditor.getState().deleteSelection()}>
            <IconTrash size={13} /> Delete
          </button>
        </div>
      </Section>
    </>
  );
}

function MultiPanel({ count }: { count: number }) {
  const align = useEditor((s) => s.alignSelection);
  return (
    <>
      <div className="insp-title">
        <span className="dot" />
        <h2>{count} objects selected</h2>
      </div>
      <Section title="Align">
        <div className="btn-row">
          <button onClick={() => align('left')}>Left</button>
          <button onClick={() => align('centerX')}>Center</button>
          <button onClick={() => align('right')}>Right</button>
        </div>
        <div className="btn-row">
          <button onClick={() => align('top')}>Top</button>
          <button onClick={() => align('centerY')}>Middle</button>
          <button onClick={() => align('bottom')}>Bottom</button>
        </div>
      </Section>
      <Section title="Object">
        <div className="btn-row">
          <button onClick={() => useEditor.getState().duplicateSelection()}>
            <IconCopy size={13} /> Duplicate
          </button>
          <button className="danger" onClick={() => useEditor.getState().deleteSelection()}>
            <IconTrash size={13} /> Delete
          </button>
        </div>
      </Section>
    </>
  );
}

function BoardPanel() {
  const project = useEditor((s) => s.project);
  const setBoard = useEditor((s) => s.setBoard);
  const setProjectName = useEditor((s) => s.setProjectName);
  const board = project.board;

  return (
    <>
      <div className="insp-title">
        <span className="dot" />
        <h2>Bench</h2>
      </div>
      <Section title="Project">
        <TextField label="Name" value={project.name} onChange={(v) => setProjectName(v)} />
        <div className="btn-row">
          <button
            onClick={() => {
              useEditor.getState().loadProject(sampleProject(), null);
              toast('Example layout loaded');
            }}
          >
            Load example
          </button>
          <button className="danger" onClick={() => useEditor.getState().newProject()}>
            New bench
          </button>
        </div>
      </Section>
      <Section title="Surface">
        <Segmented
          value={board.theme}
          options={[
            { value: 'dark', label: 'Dark bench' },
            { value: 'light', label: 'White bench' },
          ]}
          onChange={(theme) => setBoard({ theme })}
        />
        <Segmented
          value={board.mode}
          options={[
            { value: 'plate', label: 'Breadboard' },
            { value: 'infinite', label: 'Infinite' },
          ]}
          onChange={(mode) => setBoard({ mode })}
        />
        {board.mode === 'plate' && (
          <>
            <Row>
              <NumField
                label="W"
                unit="mm"
                min={50}
                step={25}
                value={board.w}
                onChange={(w) => setBoard({ w })}
              />
              <NumField
                label="H"
                unit="mm"
                min={50}
                step={25}
                value={board.h}
                onChange={(h) => setBoard({ h })}
              />
            </Row>
            <div className="presets">
              {BOARD_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={p.w === board.w && p.h === board.h ? 'is-active' : ''}
                  onClick={() => setBoard({ w: p.w, h: p.h })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}
        <Toggle
          label="Show hole grid"
          checked={board.showGrid}
          onChange={(v) => setBoard({ showGrid: v })}
        />
        <div className="hint">
          Hole pitch {board.pitch} mm (M6, standard optical table). Snapping lands part centres on
          holes.
        </div>
      </Section>
      <Section title="Shortcuts">
        <div className="keys">
          <span>V / B / T</span>
          <b>select / beam / text</b>
          <span>Space + drag</span>
          <b>pan</b>
          {IS_MAC ? (
            <>
              <span>Two-finger scroll</span>
              <b>pan</b>
              <span>Pinch or ⌘+scroll</span>
              <b>zoom at cursor</b>
            </>
          ) : (
            <>
              <span>Wheel</span>
              <b>zoom at cursor</b>
            </>
          )}
          <span>Shift</span>
          <b>constrain, 15 deg steps</b>
          <span>
            {chord('Z')} / {chord('Shift+Z')}
          </span>
          <b>undo / redo</b>
          <span>0</span>
          <b>fit view</b>
        </div>
      </Section>
    </>
  );
}

function ConflictPanel({ ids }: { ids: Set<string> }) {
  const project = useEditor((s) => s.project);
  const select = useEditor((s) => s.select);
  const list = project.items.filter((i) => ids.has(i.id));
  return (
    <Section
      title={`Conflicts - ${ids.size}`}
      right={<IconAlert size={14} className="danger-icon" />}
    >
      <div className="conflict-list">
        {list.map((i) => {
          const name =
            i.kind === 'lib'
              ? (CATALOG_BY_KEY.get(i.lib)?.name ?? i.lib)
              : i.kind === 'text'
                ? 'Text'
                : i.label || 'Custom part';
          return (
            <button key={i.id} onClick={() => select([i.id])}>
              <span className="cl-name">{name}</span>
              <span className="cl-pos">
                {fmt(i.x, 0)}, {fmt(i.y, 0)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="hint danger-text">
        Footprints overlap. Move the parts apart or shrink them.
      </div>
    </Section>
  );
}
