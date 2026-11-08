import { useEditor } from '../store';
import { useConflictIds } from '../lib/conflicts';
import { fmt } from '../lib/geom';
import { IconAlert } from './Icons';

export function StatusBar() {
  const cursor = useEditor((s) => s.cursor);
  const zoom = useEditor((s) => s.view.zoom);
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  const conflicts = useConflictIds();
  const board = project.board;

  return (
    <footer className="statusbar">
      <span className="sb-item mono">
        {cursor ? `x ${fmt(cursor.x)}  y ${fmt(cursor.y)}` : 'x —  y —'}
        <em>mm</em>
      </span>
      <span className="sb-sep" />
      <span className="sb-item mono">{Math.round(zoom * 100)}%</span>
      <span className="sb-sep" />
      <span className="sb-item">
        {project.items.length} parts · {project.beams.length} beams
      </span>
      <span className="sb-sep" />
      <span className={`sb-item ${conflicts.size ? 'is-bad' : ''}`}>
        {conflicts.size ? (
          <>
            <IconAlert size={12} /> {conflicts.size} colliding
          </>
        ) : (
          'no collisions'
        )}
      </span>
      <span className="sb-spacer" />
      <span className="sb-item dim">
        {selection.length ? `${selection.length} selected` : board.mode === 'plate' ? `bench ${board.w} × ${board.h} mm` : 'infinite bench'}
      </span>
    </footer>
  );
}
