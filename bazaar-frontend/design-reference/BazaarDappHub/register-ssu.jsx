// register-ssu.jsx — "Register Just for Me" (NoTribe SSU) floating window.
// Single SSU-id input + generated marketplace link on success.

(function () {
  const ORANGE = '#ff9030';
  const DIM = '#b86620';
  const GREEN = '#3ad278';
  const RED = '#ff5a30';
  const FG = '#f2efe8';
  const FG2 = '#c8bda9';
  const MUTED = '#8a7a66';

  const fieldLabel = {
    fontSize: 12, letterSpacing: '0.04em', color: FG2,
    marginBottom: 8, display: 'block',
  };
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

  function FullCopyBtn({ onClick, label }) {
    const [hover, setHover] = React.useState(false);
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: '100%',
          padding: '11px 14px',
          background: hover ? 'rgba(255,144,48,0.14)' : 'transparent',
          border: `1px solid ${ORANGE}`,
          color: ORANGE,
          fontFamily: 'inherit',
          fontSize: 13,
          letterSpacing: '0.06em',
          cursor: 'pointer',
          transition: 'background 120ms ease',
        }}>{label}</button>
    );
  }

  function SuccessPanel({ ssu, onClose }) {
    const url = `https://notribe.bazaar.app/?ssuId=${ssu}`;
    const short = ssu.slice(0, 8) + '…' + ssu.slice(-6);
    return (
      <React.Fragment>
        <div style={{
          textAlign: 'center', color: GREEN,
          fontSize: 16, letterSpacing: '0.02em',
          margin: '6px 0 22px',
        }}>
          SSU registered as standalone marketplace.
        </div>
        <div style={{
          border: `1px solid ${DIM}`,
          padding: '22px 26px',
          display: 'flex', flexDirection: 'column', gap: 12,
          background: 'rgba(20,14,8,0.45)',
        }}>
          <div style={{ fontSize: 13, color: FG2 }}>
            SSU: <span style={{ color: ORANGE, fontWeight: 700 }}>{short}</span>
          </div>
          <div style={{ fontSize: 12, color: FG2, letterSpacing: '0.04em' }}>MARKETPLACE LINK</div>
          <code style={{
            fontFamily: 'inherit', fontSize: 13, color: FG,
            background: 'rgba(8,6,4,0.7)', border: `1px solid #2e1f10`,
            padding: '10px 12px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{url}</code>
          <FullCopyBtn
            label="Copy Link"
            onClick={() => navigator.clipboard?.writeText(url)}
          />
          <div style={{ fontSize: 13, color: FG2, lineHeight: 1.6, marginTop: 4 }}>
            Share this link with customers to access your standalone marketplace. No tribe affiliation, EVE currency, default tax rates.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
          <PrimaryBtn onClick={onClose}>Done</PrimaryBtn>
        </div>
      </React.Fragment>
    );
  }

  function RegisterSSUOverlay({ open, onClose }) {
    const [ssu, setSsu] = React.useState('');
    const [done, setDone] = React.useState(false);

    React.useEffect(() => {
      if (open) { setSsu(''); setDone(false); }
    }, [open]);

    React.useEffect(() => {
      if (!open) return;
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const ssuOk = /^0x[a-fA-F0-9]{6,}/.test(ssu.trim());
    const showError = ssu.length > 0 && !ssuOk;
    const headerLabel = done ? 'SSU REGISTERED' : 'REGISTER SSU - NOTRIBE';

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
            width: 'min(960px, calc(100% - 80px))',
            background: '#0e0a06',
            border: `1.5px solid ${ORANGE}`,
            boxShadow: `0 0 0 1px rgba(255,144,48,0.12), 0 0 60px rgba(255,144,48,0.18), 0 24px 80px rgba(0,0,0,0.6)`,
            padding: '28px 32px 30px',
            position: 'relative',
            animation: 'ssuPop 200ms ease-out',
          }}>
          <CornerBrackets />

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 14,
          }}>
            <h2 style={{
              margin: 0, fontFamily: 'inherit',
              fontSize: 16, fontWeight: 700, letterSpacing: '0.16em',
              color: ORANGE,
            }}>{headerLabel}</h2>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none',
                color: FG2, fontFamily: 'inherit', fontSize: 13,
                letterSpacing: '0.06em', cursor: 'pointer', padding: 4,
              }}>Close</button>
          </div>

          {done ? (
            <SuccessPanel ssu={ssu.trim()} onClose={onClose} />
          ) : (
            <React.Fragment>
              <div style={{
                fontSize: 13, color: FG2, letterSpacing: '0.02em',
                lineHeight: 1.55, marginBottom: 22,
              }}>
                Register your SSU as a standalone marketplace (no tribe affiliation). Paste your SSU Smart Assembly ID below to generate your marketplace link.
              </div>

              <div style={{ marginBottom: 4 }}>
                <label style={fieldLabel}>SSU Smart Assembly ID</label>
                <input
                  type="text"
                  value={ssu}
                  onChange={(e) => setSsu(e.target.value)}
                  placeholder="0x..."
                  style={{
                    ...inputBase,
                    borderColor: showError ? RED : DIM,
                  }}
                />
                {showError && (
                  <div style={{
                    fontSize: 12, color: RED, letterSpacing: '0.02em', marginTop: 8,
                  }}>SSU ID must start with 0x and contain a hex string.</div>
                )}
              </div>

              <div style={{
                display: 'flex', justifyContent: 'flex-end',
                alignItems: 'center', gap: 8, marginTop: 28,
              }}>
                <GhostBtn onClick={onClose}>Cancel</GhostBtn>
                <PrimaryBtn
                  disabled={!ssuOk}
                  onClick={() => ssuOk && setDone(true)}
                >Register</PrimaryBtn>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    );
  }

  window.RegisterSSUOverlay = RegisterSSUOverlay;
})();
