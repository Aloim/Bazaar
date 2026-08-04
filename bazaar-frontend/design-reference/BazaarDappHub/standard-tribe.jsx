// standard-tribe.jsx — "Create a Bazaar Tribe" (Standard) floating window.
// Single-step quick-setup modal. Shares the orange/dark vocab and
// corner-bracket frame used by the other overlays.

(function () {
  const ORANGE = '#ff9030';
  const DIM = '#b86620';
  const GREEN = '#3ad278';
  const FG = '#f2efe8';
  const FG2 = '#c8bda9';
  const MUTED = '#8a7a66';

  const fieldLabel = {
    fontSize: 12, letterSpacing: '0.04em', color: FG2,
    marginBottom: 8, display: 'block',
  };
  const counter = { color: MUTED, fontWeight: 400 };
  const inputBase = {
    width: '100%',
    background: 'rgba(8,6,4,0.85)',
    border: `1px solid ${DIM}`,
    color: FG,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    fontSize: 14,
    letterSpacing: '0.02em',
    padding: '12px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
  };

  function CornerBrackets() {
    const corners = [
      { top: -1, left: -1, borderWidth: '2px 0 0 2px' },
      { top: -1, right: -1, borderWidth: '2px 2px 0 0' },
      { bottom: -1, left: -1, borderWidth: '0 0 2px 2px' },
      { bottom: -1, right: -1, borderWidth: '0 2px 2px 0' },
    ];
    return corners.map((s, i) => (
      <span key={i} style={{
        position: 'absolute', width: 14, height: 14,
        borderColor: ORANGE, borderStyle: 'solid', ...s,
      }}/>
    ));
  }

  function PrimaryBtn({ children, onClick, disabled }) {
    const [hover, setHover] = React.useState(false);
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: '11px 22px',
          background: disabled
            ? 'rgba(184,102,32,0.18)'
            : (hover ? ORANGE : 'rgba(255,144,48,0.16)'),
          border: `1px solid ${disabled ? DIM : ORANGE}`,
          color: disabled ? MUTED : (hover ? '#080604' : ORANGE),
          fontFamily: 'inherit',
          fontSize: 13,
          letterSpacing: '0.04em',
          fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: hover && !disabled
            ? '0 0 22px rgba(255,144,48,0.35)'
            : '0 0 18px rgba(255,144,48,0.18)',
          transition: 'all 120ms ease',
        }}>{children}</button>
    );
  }

  function GhostBtn({ children, onClick }) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          background: 'transparent', border: 'none',
          color: FG2, fontFamily: 'inherit', fontSize: 13,
          letterSpacing: '0.06em', cursor: 'pointer', padding: '10px 14px',
        }}>{children}</button>
    );
  }

  function StepCreated({ data, onClose }) {
    return (
      <React.Fragment>
        <div style={{
          textAlign: 'center', color: GREEN,
          fontSize: 16, letterSpacing: '0.02em',
          margin: '6px 0 22px',
        }}>
          Your Standard Bazaar tribe has been created!
        </div>

        <div style={{
          border: `1px solid ${DIM}`,
          padding: '22px 26px',
          display: 'flex', flexDirection: 'column', gap: 12,
          background: 'rgba(20,14,8,0.45)',
        }}>
          <div style={{
            fontSize: 18, fontWeight: 700, letterSpacing: '0.02em', color: FG,
          }}>{data.name || 'Unnamed Tribe'}</div>
          <div style={{ fontSize: 13, color: FG2, letterSpacing: '0.02em' }}>
            {data.description || '—'}
          </div>
          <div style={{ fontSize: 13, color: FG2, letterSpacing: '0.02em' }}>
            Currency: <span style={{ color: ORANGE, fontWeight: 700 }}>EVE (standard)</span>
          </div>
          <div style={{ fontSize: 13, color: FG2, letterSpacing: '0.02em' }}>
            Tax Rate: <span style={{ color: ORANGE, fontWeight: 700 }}>Default (2.5%)</span>
          </div>
          <div style={{
            fontSize: 13, color: FG2, lineHeight: 1.6,
            letterSpacing: '0.01em', marginTop: 4,
          }}>
            Configure members and shopfronts via the tribe admin panel.
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end',
          marginTop: 22,
        }}>
          <PrimaryBtn onClick={onClose}>Done</PrimaryBtn>
        </div>
      </React.Fragment>
    );
  }

  function StandardTribeOverlay({ open, onClose }) {
    const [data, setData] = React.useState({ name: '', description: '' });
    const [created, setCreated] = React.useState(false);
    const set = (patch) => setData((d) => ({ ...d, ...patch }));

    React.useEffect(() => {
      if (open) {
        setData({ name: '', description: '' });
        setCreated(false);
      }
    }, [open]);

    React.useEffect(() => {
      if (!open) return;
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const canCreate = data.name.trim().length > 0;
    const headerLabel = created ? 'TRIBE CREATED' : 'CREATE STANDARD BAZAAR';

    return (
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(8,6,4,0.72)',
          backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'ssuFade 160ms ease-out',
        }}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(880px, calc(100% - 80px))',
            background: '#0e0a06',
            border: `1.5px solid ${ORANGE}`,
            boxShadow: `0 0 0 1px rgba(255,144,48,0.12), 0 0 60px rgba(255,144,48,0.18), 0 24px 80px rgba(0,0,0,0.6)`,
            padding: '28px 32px 30px',
            position: 'relative',
            animation: 'ssuPop 200ms ease-out',
          }}>
          <CornerBrackets />

          {/* header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 14,
          }}>
            <h2 style={{
              margin: 0, fontFamily: 'inherit',
              fontSize: 16, fontWeight: 700, letterSpacing: '0.16em',
              color: ORANGE,
            }}>{headerLabel}</h2>
            {!created && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent', border: 'none',
                  color: FG2, fontFamily: 'inherit', fontSize: 13,
                  letterSpacing: '0.06em', cursor: 'pointer', padding: 4,
                }}>Close</button>
            )}
          </div>

          {created ? (
            <StepCreated data={data} onClose={onClose} />
          ) : (
            <React.Fragment>
              <div style={{
                fontSize: 13, color: FG2, letterSpacing: '0.02em',
                lineHeight: 1.55, marginBottom: 22,
              }}>
                Quick setup with sensible defaults. Your tribe will use the standard EVE currency and default tax rates. You can customize later.
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={fieldLabel}>
                  Tribe Name <span style={counter}>({data.name.length}/50)</span>
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={data.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="e.g. Frontier Traders Guild"
                  style={inputBase}
                />
              </div>

              <div style={{ marginBottom: 4 }}>
                <label style={fieldLabel}>
                  Description <span style={counter}>({data.description.length}/200)</span>
                </label>
                <textarea
                  maxLength={200}
                  value={data.description}
                  onChange={(e) => set({ description: e.target.value })}
                  placeholder="Describe your tribe and marketplace..."
                  rows={4}
                  style={{ ...inputBase, resize: 'vertical', minHeight: 110, lineHeight: 1.55 }}
                />
              </div>

              <div style={{
                display: 'flex', justifyContent: 'flex-end',
                alignItems: 'center', gap: 8, marginTop: 22,
              }}>
                <GhostBtn onClick={onClose}>Cancel</GhostBtn>
                <PrimaryBtn
                  disabled={!canCreate}
                  onClick={() => canCreate && setCreated(true)}
                >Create Tribe</PrimaryBtn>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    );
  }

  window.StandardTribeOverlay = StandardTribeOverlay;
})();
