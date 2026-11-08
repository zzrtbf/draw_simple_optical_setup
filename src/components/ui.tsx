import type { ReactNode } from 'react';

export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {right}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="row">{children}</div>;
}

export function NumField({
  label,
  value,
  unit,
  step = 1,
  min,
  max,
  disabled,
  onChange,
  onFocusDirty,
}: {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
  onFocusDirty?: () => void;
}) {
  return (
    <label className={`numfield${disabled ? ' is-disabled' : ''}`}>
      <span className="nf-label">{label}</span>
      <input
        type="number"
        className="nf-input"
        value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onFocus={onFocusDirty}
        onChange={(e) => {
          const v = Number.parseFloat(e.target.value);
          if (Number.isFinite(v)) {
            const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
            onChange(clamped);
          }
        }}
      />
      {unit && <span className="nf-unit">{unit}</span>}
    </label>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="textfield">
      <span className="nf-label">{label}</span>
      {multiline ? (
        <textarea
          className="tf-input"
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="tf-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      className={`toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
      title={hint}
    >
      <span className="toggle-track">
        <span className="toggle-knob" />
      </span>
      <span className="toggle-label">{label}</span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Swatches({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch${c.toLowerCase() === value.toLowerCase() ? ' is-active' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          title={c}
        />
      ))}
      <label className="swatch swatch-custom" title="Custom colour">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}
