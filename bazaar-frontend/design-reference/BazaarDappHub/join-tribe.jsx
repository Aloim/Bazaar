// join-tribe.jsx — "Register to a Tribe" floating window.
// SSU-id input + searchable tribe directory. Shares orange/dark vocab and
// corner-bracket frame with the other overlays.

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

  const TRIBES = [
    {
      id: 'frontier-traders',
      name: 'Frontier Traders Guild',
      desc: 'Cross-region open marketplace. Standard EVE currency, low-fee escrow.',
      members: 142,
      open: true,
      currency: 'EVE',
      tax: '2.0%',
    },
    {
      id: 'sovereign-exchange',
      name: 'Sovereign Exchange',
      desc: 'Custom token economy. Vetted operators, governance via SOV holders.',
      members: 38,
      open: false,
      currency: 'SOV',
      tax: '3.5%',
    },
    {
      id: 'neon-bazaar',
      name: 'Neon Bazaar',
      desc: 'High-volume consumer goods. Pooled storefronts, weekly tribute split.',
      members: 87,
      open: true,
      currency: 'EVE',
      tax: '2.5%',
    },
    {
      id: 'deepvoid-cartel',
      name: 'Deepvoid Cartel',
      desc: 'Frontier-edge logistics. Application + reputation check required.',
      members: 21,
      open: false,
      currency: 'VOID',
      tax: '4.0%',
    },
  ];

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

  function PrimaryBtn({ children, onClick, disabled, small }) {
    const [hover, setHover] = React.useState(false);
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: small ? '7px 14px' : '11px 22px',
          background: disabled
            ? 'rgba(184,102,32,0.18)'
            : (hover ? ORANGE : 'rgba(255,144,48,0.16)'),
          border: `1px solid ${disabled ? DIM : ORANGE}`,
          color: disabled ? MUTED : (hover ? '#080604' : ORANGE),
          fontFamily: 'inherit',
          fontSize: small ? 12 : 13,
          letterSpacing: '0.04em',
          fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: hover && !disabled
            ? '0 0 18px rgba(255,144,48,0.35)'
            : (small ? 'none' : '0 0 18px rgba(255,144,48,0.18)'),
          transition: 'all 120ms ease',
          whiteSpace: 'nowrap',
        }}>{children}</button>
    );
  }

  function GhostBtn({ children, onClick, small }) {
    const [hover, setHover] = React.useState(false);
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: small ? '7px 14px' : '10px 14px',
          background: hover ? 'rgba(184,102,32,0.10)' : 'transparent',
          border: small ? `1px solid ${DIM}` : 'none',
          color: hover ? ORANGE : FG2,
          fontFamily: 'inherit',
          fontSize: small ? 12 : 13,
          letterSpacing: '0.06em',
          cursor: 'pointer',
          transition: 'all 120ms ease',
          whiteSpace: 'nowrap',
        }}>{children}</button>
    );
  }

  function TribeRow({ tribe, ssuOk, onAction }) {
    const [hover, setHover] = React.useState(false);
    return (
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          border: `1px solid ${hover ? DIM : '#2e1f10'}`,
          background: hover ? 'rgba(184,102,32,0.06)' : 'rgba(20,14,8,0.45)',
          padding: '16px 18px',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 16, alignItems: 'center',
          transition: 'all 120ms ease',
        }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{
              color: FG, fontWeight: 700, fontSize: 15, letterSpacing: '0.03em',
            }}>{tribe.name}</span>
            <span style={{
              padding: '2px 8px',
              border: `1px solid ${tribe.open ? GREEN : DIM}`,
              color: tribe.open ? GREEN : DIM,
              background: tribe.open ? 'rgba(58,210,120,0.10)' : 'transparent',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
            }}>{tribe.open ? 'OPEN' : 'APPLY'}</span>
          </div>
          <div style={{
            fontSize: 12, color: FG2, lineHeight: 1.5, letterSpacing: '0.01em',
          }}>{tribe.desc}</div>
          <div style={{
            display: 'flex', gap: 18, fontSize: 11,
            color: MUTED, letterSpacing: '0.06em', fontWeight: 700,
            marginTop: 2,
          }}>
            <span>{tribe.members} MEMBERS</span>
            <span style={{ opacity: 0.5 }}>│</span>
            <span>CCY · <span style={{ color: ORANGE }}>{tribe.currency}</span></span>
            <span style={{ opacity: 0.5 }}>│</span>
            <span>TAX · {tribe.tax}</span>
          </div>
        </div>
        <div>
          {tribe.open
            ? <PrimaryBtn small disabled={!ssuOk} onClick={() => onAction(tribe)}>Register</PrimaryBtn>
            : <GhostBtn small onClick={() => onAction(tribe)}>Apply ▸</GhostBtn>}
        </div>
      </div>
    );
  }

  function SuccessPanel({ tribe, ssu, onClose }) {
    return (
      <React.Fragment>
        <div style={{
          textAlign: 'center', color: GREEN,
          fontSize: 16, letterSpacing: '0.02em',
          margin: '6px 0 22px',
        }}>
          {tribe.open ? 'SSU registered to tribe.' : 'Application submitted.'}
        </div>
        <div style={{
          border: `1px solid ${DIM}`,
          padding: '22px 26px',
          display: 'flex', flexDirection: 'column', gap: 12,
          background: 'rgba(20,14,8,0.45)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: FG, letterSpacing: '0.02em' }}>
            {tribe.name}
          </div>
          <div style={{ fontSize: 13, color: FG2, letterSpacing: '0.02em' }}>
            SSU: <span style={{ color: ORANGE }}>{ssu.slice(0,8)}…{ssu.slice(-6)}</span>
          </div>
          <div style={{ fontSize: 13, color: FG2, letterSpacing: '0.02em' }}>
            Currency: <span style={{ color: ORANGE, fontWeight: 700 }}>{tribe.currency}</span>
            {'  ·  '}
            Tax: <span style={{ color: ORANGE, fontWeight: 700 }}>{tribe.tax}</span>
          </div>
          <div style={{ fontSize: 13, color: FG2, lineHeight: 1.6, marginTop: 4 }}>
            {tribe.open
              ? 'Your SSU is now part of the tribe marketplace. Storefronts will sync on the next block.'
              : 'A tribe officer will review your application. You\u2019ll see the result in your hub notifications.'}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
          <PrimaryBtn onClick={onClose}>Done</PrimaryBtn>
        </div>
      </React.Fragment>
    );
  }

  function JoinTribeOverlay({ open, onClose }) {
    const [ssu, setSsu] = React.useState('');
    const [q, setQ] = React.useState('');
    const [done, setDone] = React.useState(null); // tribe object once submitted

    React.useEffect(() => {
      if (open) { setSsu(''); setQ(''); setDone(null); }
    }, [open]);

    React.useEffect(() => {
      if (!open) return;
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const ssuOk = /^0x[a-fA-F0-9]{6,}/.test(ssu.trim());
    const filtered = TRIBES.filter((t) => {
      if (!q.trim()) return true;
      const s = q.trim().toLowerCase();
      return t.name.toLowerCase().includes(s) || t.desc.toLowerCase().includes(s);
    });

    const headerLabel = done ? (done.open ? 'REGISTERED' : 'APPLICATION SENT') : 'JOIN A TRIBE';

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
            maxHeight: 'calc(100% - 80px)',
            background: '#0e0a06',
            border: `1.5px solid ${ORANGE}`,
            boxShadow: `0 0 0 1px rgba(255,144,48,0.12), 0 0 60px rgba(255,144,48,0.18), 0 24px 80px rgba(0,0,0,0.6)`,
            padding: '28px 32px 30px',
            position: 'relative',
            display: 'flex', flexDirection: 'column',
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
            <SuccessPanel tribe={done} ssu={ssu} onClose={onClose} />
          ) : (
            <React.Fragment>
              <div style={{
                fontSize: 13, color: FG2, letterSpacing: '0.02em',
                lineHeight: 1.55, marginBottom: 18,
              }}>
                Search for a tribe to register your SSU with. Open tribes allow direct registration; others require an application.
              </div>

              {/* SSU input */}
              <div style={{ marginBottom: 14 }}>
                <label style={fieldLabel}>Your SSU Smart Assembly ID</label>
                <input
                  type="text"
                  value={ssu}
                  onChange={(e) => setSsu(e.target.value)}
                  placeholder="0x... (required to register)"
                  style={{
                    ...inputBase,
                    borderColor: ssu.length > 0 && !ssuOk ? '#ff5a30' : DIM,
                  }}
                />
              </div>

              {/* Search */}
              <div style={{ marginBottom: 14 }}>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search tribes by name or description..."
                  style={inputBase}
                />
              </div>

              {/* Tribe list */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 10,
                overflowY: 'auto', maxHeight: 380,
                paddingRight: 4,
                marginBottom: 6,
              }}>
                {filtered.length === 0 ? (
                  <div style={{
                    padding: '18px 4px',
                    color: MUTED, fontSize: 14, letterSpacing: '0.02em',
                  }}>No tribes available.</div>
                ) : (
                  filtered.map((t) => (
                    <TribeRow
                      key={t.id}
                      tribe={t}
                      ssuOk={ssuOk}
                      onAction={(tribe) => setDone(tribe)}
                    />
                  ))
                )}
              </div>

              {/* footer hint */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginTop: 14,
                fontSize: 11, letterSpacing: '0.12em',
                color: MUTED, fontWeight: 700,
              }}>
                <span>{filtered.length} OF {TRIBES.length} TRIBES</span>
                <span>{ssuOk ? <span style={{color: GREEN}}>● SSU READY</span> : 'ENTER SSU TO REGISTER'}</span>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    );
  }

  window.JoinTribeOverlay = JoinTribeOverlay;
})();
