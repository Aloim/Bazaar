// advanced-tribe.jsx — "Create an Advanced Tribe" multi-step floating window.
// 3-step wizard + post-create success state. Shares the orange/dark vocab
// and corner-bracket frame used by SSUOverlay / ContactOverlay.

(function () {
  const ORANGE = '#ff9030';
  const DIM = '#b86620';
  const RED = '#ff5a30';
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
  const helper = { fontSize: 12, color: MUTED, marginTop: 8, letterSpacing: '0.02em' };

  function StepDots({ step, total }) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 14,
        margin: '4px 0 20px',
      }}>
        {Array.from({ length: total }).map((_, i) => {
          const active = i === step;
          return (
            <span key={i} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: active ? ORANGE : 'transparent',
              border: `1.5px solid ${active ? ORANGE : DIM}`,
              boxShadow: active ? `0 0 8px rgba(255,144,48,0.6)` : 'none',
              transition: 'all 160ms ease',
            }}/>
          );
        })}
      </div>
    );
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
          boxShadow: hover && !disabled ? '0 0 22px rgba(255,144,48,0.35)' : '0 0 18px rgba(255,144,48,0.18)',
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

  // ───────── Step 1: identity ─────────
  function StepIdentity({ data, set }) {
    return (
      <React.Fragment>
        <div style={{
          fontSize: 13, color: FG2, letterSpacing: '0.02em',
          marginBottom: 22,
        }}>Step 1 of 3: Define your tribe identity.</div>

        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabel}>
            Tribe Name <span style={counter}>({data.name.length}/50)</span>
          </label>
          <input
            type="text"
            maxLength={50}
            value={data.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Sovereign Exchange"
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
            placeholder="Describe your tribe and its marketplace..."
            rows={4}
            style={{ ...inputBase, resize: 'vertical', minHeight: 110, lineHeight: 1.55 }}
          />
        </div>
      </React.Fragment>
    );
  }

  // ───────── Step 2: token ─────────
  function StepToken({ data, set }) {
    return (
      <React.Fragment>
        <div style={{
          fontSize: 13, color: FG2, letterSpacing: '0.02em',
          marginBottom: 22, lineHeight: 1.55,
        }}>
          Step 2 of 3: Configure your tribe's custom token. This token will be used as the marketplace currency.
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabel}>
            Token Name <span style={counter}>({data.tokenName.length}/32)</span>
          </label>
          <input
            type="text"
            maxLength={32}
            value={data.tokenName}
            onChange={(e) => set({ tokenName: e.target.value })}
            placeholder="e.g. Sovereign Coin"
            style={inputBase}
          />
        </div>

        <div>
          <label style={fieldLabel}>
            Token Symbol <span style={counter}>({data.tokenSymbol.length}/8)</span>
          </label>
          <input
            type="text"
            maxLength={8}
            value={data.tokenSymbol}
            onChange={(e) => {
              const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
              set({ tokenSymbol: v });
            }}
            placeholder="E.G. SOV"
            style={inputBase}
          />
          <div style={helper}>
            Uppercase letters and numbers only. This cannot be changed after creation.
          </div>
        </div>
      </React.Fragment>
    );
  }

  // ───────── Step 3: review ─────────
  function StepReview({ data }) {
    const Field = ({ k, v, color }) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: FG2, letterSpacing: '0.02em' }}>{k}</span>
        <span style={{
          fontSize: 16, fontWeight: 700, letterSpacing: '0.02em',
          color: color || FG,
        }}>{v}</span>
      </div>
    );

    return (
      <React.Fragment>
        <div style={{
          fontSize: 13, color: FG2, letterSpacing: '0.02em',
          marginBottom: 18,
        }}>Step 3 of 3: Review your tribe configuration.</div>

        <div style={{
          border: `1px solid ${DIM}`,
          padding: '20px 24px',
          display: 'flex', flexDirection: 'column', gap: 16,
          background: 'rgba(20,14,8,0.45)',
          marginBottom: 16,
        }}>
          <Field k="Tribe Name" v={data.name || '—'} color={ORANGE} />
          <Field k="Description" v={data.description || '—'} />
          <Field
            k="Token"
            v={
              <span>
                <span style={{ color: ORANGE }}>{data.tokenName || '—'}</span>
                {data.tokenSymbol && (
                  <span style={{ color: ORANGE }}> ({data.tokenSymbol})</span>
                )}
              </span>
            }
          />
        </div>

        <div style={{
          border: `1px solid ${DIM}`,
          background: 'rgba(184,102,32,0.08)',
          padding: '14px 18px',
          fontSize: 13, lineHeight: 1.55, color: FG2,
          letterSpacing: '0.01em',
        }}>
          <span style={{ color: ORANGE, fontWeight: 700 }}>Note:</span>{' '}
          Creating a tribe will deploy a new token contract and configure the marketplace. This action cannot be undone.
        </div>
      </React.Fragment>
    );
  }

  // ───────── Success ─────────
  function StepCreated({ data, onClose }) {
    return (
      <React.Fragment>
        <div style={{
          textAlign: 'center', color: GREEN,
          fontSize: 16, letterSpacing: '0.02em',
          margin: '6px 0 22px',
        }}>
          Your Advanced Bazaar tribe has been created!
        </div>

        <div style={{
          border: `1px solid ${DIM}`,
          padding: '22px 26px',
          display: 'flex', flexDirection: 'column', gap: 14,
          background: 'rgba(20,14,8,0.45)',
        }}>
          <div style={{
            fontSize: 18, fontWeight: 700, letterSpacing: '0.02em', color: FG,
          }}>{data.name || 'Unnamed Tribe'}</div>
          <div style={{ fontSize: 13, color: FG2, letterSpacing: '0.02em' }}>
            {data.description || '—'}
          </div>
          <div style={{ fontSize: 13, color: FG2, letterSpacing: '0.02em' }}>
            Planned Token:{' '}
            <span style={{ color: ORANGE, fontWeight: 700 }}>
              {data.tokenName || '—'}
              {data.tokenSymbol && ` (${data.tokenSymbol})`}
            </span>
          </div>
          <div style={{ fontSize: 13, color: FG2, letterSpacing: '0.02em' }}>
            TribeLeaderCap ID:{' '}
            <span style={{ color: ORANGE }}>
              Unknown — check your wallet for the TribeLeaderCap
            </span>
          </div>
          <FullCopyBtn
            label="Copy ID"
            onClick={() => navigator.clipboard?.writeText('Unknown')}
          />
          <div style={{
            fontSize: 13, color: FG2, lineHeight: 1.6,
            letterSpacing: '0.01em', marginTop: 4,
          }}>
            Configure your token economy via the tribe admin panel after joining.
          </div>
          <div style={{
            fontSize: 13, color: FG2, lineHeight: 1.6,
            letterSpacing: '0.01em',
          }}>
            Whenever you interact with one of your tribe's SSUs that run the Bazaar DApp, you will now have an extra menu for tribe governance.
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

  // ───────── Shell ─────────
  function AdvancedTribeOverlay({ open, onClose }) {
    const [step, setStep] = React.useState(0); // 0,1,2 = wizard; 3 = created
    const [data, setData] = React.useState({
      name: '', description: '',
      tokenName: '', tokenSymbol: '',
    });
    const set = (patch) => setData((d) => ({ ...d, ...patch }));

    // reset when re-opening
    React.useEffect(() => {
      if (open) { setStep(0); }
    }, [open]);

    React.useEffect(() => {
      if (!open) return;
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const isCreated = step === 3;

    const canNext = (
      (step === 0 && data.name.trim().length > 0) ||
      (step === 1 && data.tokenName.trim().length > 0 && data.tokenSymbol.trim().length > 0) ||
      step === 2
    );

    const headerLabel = isCreated
      ? 'TRIBE CREATED'
      : 'WARNING EXPERIMENTAL: CREATE ADVANCED BAZAAR';

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
            marginBottom: isCreated ? 12 : 6,
          }}>
            <h2 style={{
              margin: 0, fontFamily: 'inherit',
              fontSize: 16, fontWeight: 700, letterSpacing: '0.16em',
              color: ORANGE,
            }}>{headerLabel}</h2>
            {!isCreated && (
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

          {/* step indicator */}
          {!isCreated && <StepDots step={step} total={3} />}

          {/* body */}
          {step === 0 && <StepIdentity data={data} set={set} />}
          {step === 1 && <StepToken data={data} set={set} />}
          {step === 2 && <StepReview data={data} />}
          {step === 3 && <StepCreated data={data} onClose={onClose} />}

          {/* footer (wizard only) */}
          {!isCreated && (
            <div style={{
              display: 'flex', justifyContent: 'flex-end',
              alignItems: 'center', gap: 8, marginTop: 24,
            }}>
              {step > 0 && <GhostBtn onClick={() => setStep(step - 1)}>Back</GhostBtn>}
              <GhostBtn onClick={onClose}>Cancel</GhostBtn>
              {step < 2 && (
                <PrimaryBtn
                  disabled={!canNext}
                  onClick={() => canNext && setStep(step + 1)}
                >Next</PrimaryBtn>
              )}
              {step === 2 && (
                <PrimaryBtn onClick={() => setStep(3)}>Create Tribe</PrimaryBtn>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  window.AdvancedTribeOverlay = AdvancedTribeOverlay;
})();
