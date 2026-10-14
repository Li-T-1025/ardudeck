import { useEffect, useState } from 'react';

/** One text field for a position in any coordinate format; commits on Enter or blur, keeps unreadable text marked. */
export function PositionInput({ value, parse, onCommit, invalidHint, className = '' }: {
  value: string;
  parse: (text: string) => { lat: number; lon: number } | null;
  onCommit: (p: { lat: number; lon: number }) => void;
  invalidHint: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(value); setInvalid(false); }, [value]);

  const commit = () => {
    if (draft.trim() === value.trim()) return setInvalid(false);
    const p = parse(draft);
    if (!p) return setInvalid(true);
    setInvalid(false);
    onCommit(p);
  };

  return (
    <div>
      <input
        type="text"
        value={draft}
        spellCheck={false}
        onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value); setInvalid(false); }
        }}
        aria-invalid={invalid}
        className={`w-full px-2 py-1 text-xs font-mono bg-surface-input border rounded text-content tabular-nums focus:outline-none ${invalid ? 'border-red-500/70' : 'border-subtle focus:border-blue-500/50'} ${className}`}
      />
      {invalid && <p className="mt-0.5 text-[10px] text-red-400">{invalidHint}</p>}
    </div>
  );
}
