// hub.jsx — Bazaar Hub Beta UI overlay.
// Mounts on top of the matrix rain backdrop. All layout sized for 1920×1080.

const W = window.STAGE_W || 1920;
const H = window.STAGE_H || 1080;

// ─────────────────────────────────────────────────────────────────────────────
// Auto-scale stage (1920×1080 letterboxed in viewport)
// ─────────────────────────────────────────────────────────────────────────────
function Stage({ children }) {
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    const fit = () => {
      const sx = window.innerWidth / W;
      const sy = window.innerHeight / H;
      setScale(Math.min(sx, sy));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        width: W, height: H,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center',
        background: '#080604',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top HUD strip
// ─────────────────────────────────────────────────────────────────────────────
function TopBar() {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const time = new Date();
  const hh = String(time.getUTCHours()).padStart(2, '0');
  const mm = String(time.getUTCMinutes()).padStart(2, '0');
  const ss = String(time.getUTCSeconds()).padStart(2, '0');

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 44,
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center', padding: '0 28px',
      borderBottom: '1px solid rgba(255,144,48,0.32)',
      background: 'linear-gradient(180deg, rgba(8,6,4,0.92), rgba(8,6,4,0.55))',
      backdropFilter: 'blur(2px)',
      fontSize: 12, letterSpacing: '0.12em',
      color: '#8a7a66', fontWeight: 700,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <span style={{ color: '#ff9030' }}>● ONLINE</span>
        <span style={{ opacity: 0.55 }}>0xa7b4 ··· 7f77</span>
        <span style={{ opacity: 0.4 }}>│</span>
        <span>UTC {hh}:{mm}:{ss}</span>
      </div>
      <div style={{
        color: '#ff9030', fontSize: 13, letterSpacing: '0.5em',
        textShadow: '0 0 14px rgba(255,144,48,0.45)',
      }}>
        BAZAAR &nbsp;//&nbsp; STATION&nbsp;HUB
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 18 }}>
        <span>NODE · EVE-FRONTIER</span>
        <span style={{ opacity: 0.4 }}>│</span>
        <span>BUILD <span style={{ color: '#f2efe8' }}>0.7β</span></span>
        <span style={{ opacity: 0.4 }}>│</span>
        <span style={{ color: '#ff9030' }}>SIG ●●●○</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live stats ticker (pure visual)
// ─────────────────────────────────────────────────────────────────────────────
function StatStrip() {
  const items = [
    { k: 'SSUs Registered', v: '1,247', delta: '+18' },
    { k: 'Active Tribes',    v: '89',    delta: '+02' },
  ];
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', gap: 0,
      border: '1px solid #2e1f10',
      background: 'rgba(17,13,9,0.78)',
      backdropFilter: 'blur(3px)',
    }}>
      {items.map((it, i) => (
        <div key={it.k} style={{
          flex: 1, padding: '14px 22px',
          borderLeft: i === 0 ? 'none' : '1px solid #2e1f10',
          display: 'flex', flexDirection: 'column', gap: 4, minWidth: 170,
        }}>
          <div style={{
            fontSize: 10, letterSpacing: '0.18em',
            color: '#8a7a66', fontWeight: 700,
          }}>{it.k.toUpperCase()}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              fontSize: 22, color: '#f2efe8', fontWeight: 700,
              letterSpacing: '0.04em',
            }}>{it.v}</span>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: it.ok ? '#ff9030' : '#b86620',
              letterSpacing: '0.06em',
            }}>{it.delta}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero block (logo, title, subtitle)
// ─────────────────────────────────────────────────────────────────────────────
function BazaarMark() {
  // Simple geometric mark in the orange/dark vocab. Two stacked diamond
  // facets evoking the isometric "walking marketplace" without redrawing
  // a real logo.
  return (
    <div style={{
      width: 78, height: 78, position: 'relative',
      display: 'grid', placeItems: 'center',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        border: '1.5px solid #ff9030',
        transform: 'rotate(45deg)',
        boxShadow: '0 0 24px rgba(255,144,48,0.35), inset 0 0 16px rgba(255,144,48,0.18)',
      }}/>
      <div style={{
        position: 'absolute', inset: 14,
        border: '1px solid #b86620',
        transform: 'rotate(45deg)',
      }}/>
      <div style={{
        width: 12, height: 12,
        background: '#ff9030',
        transform: 'rotate(45deg)',
        boxShadow: '0 0 12px rgba(255,144,48,0.9)',
      }}/>
    </div>
  );
}

function Hero() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 14,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.42em',
          color: '#b86620', fontWeight: 700,
        }}>// WELCOME, CAPSULEER · NODE WATCHING</div>
        <h1 style={{
          margin: 0, fontFamily: '"Frontier Disket Mono", monospace',
          fontSize: 64, lineHeight: 0.95, fontWeight: 700,
          color: '#f2efe8', letterSpacing: '0.04em', textAlign: 'center',
        }}>
          <span style={{ color: '#ff9030' }}>BAZAAR</span> STATION HUB
          <span style={{
            display: 'inline-block', marginLeft: 14,
            fontSize: 16, padding: '4px 10px',
            border: '1.5px solid #ff5a30', color: '#ff5a30',
            transform: 'rotate(-4deg) translateY(-12px)',
            letterSpacing: '0.24em', fontWeight: 700,
          }}>BETA</span>
        </h1>
      </div>
      <p style={{
        margin: 0, maxWidth: 760, textAlign: 'center',
        fontSize: 15, lineHeight: 1.65, color: '#c8bda9',
        letterSpacing: '0.02em',
      }}>
        The isometric walk-on-station marketplace for <span style={{color:'#ff9030'}}>EVE Frontier</span>.
        Register your SSU, join or forge a tribe, and run your own corner of the bazaar.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action card — hover scan + animated chevron
// ─────────────────────────────────────────────────────────────────────────────
function ActionCard({ idx, label, hint, primary, wide, style, onClick }) {
  const [hover, setHover] = React.useState(false);
  const orange = '#ff9030';
  const dim = '#b86620';
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        textAlign: 'left',
        padding: primary ? '26px 28px' : '20px 22px',
        background: hover
          ? '#ff9030'
          : (primary ? 'rgba(255,144,48,0.10)' : 'rgba(17,13,9,0.78)'),
        backdropFilter: 'blur(3px)',
        border: `1px solid ${hover ? orange : (primary ? orange : '#2e1f10')}`,
        cursor: 'pointer',
        color: hover ? '#080604' : '#f2efe8',
        fontFamily: 'inherit',
        transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
        overflow: 'hidden',
        gridColumn: wide ? 'span 2' : 'auto',
        boxShadow: hover
          ? `0 0 0 1px ${orange}, 0 12px 36px -12px rgba(255,144,48,0.55)`
          : 'none',
        ...(style || {}),
      }}>
      {/* corner brackets */}
      {[
        { top: -1, left: -1, borderWidth: '2px 0 0 2px' },
        { top: -1, right: -1, borderWidth: '2px 2px 0 0' },
        { bottom: -1, left: -1, borderWidth: '0 0 2px 2px' },
        { bottom: -1, right: -1, borderWidth: '0 2px 2px 0' },
      ].map((s, i) => (
        <span key={i} style={{
          position: 'absolute', width: 12, height: 12,
          borderColor: hover ? '#080604' : (primary ? orange : dim),
          borderStyle: 'solid',
          transition: 'border-color 140ms ease',
          ...s,
        }}/>
      ))}

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 16,
      }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
          color: hover ? 'rgba(8,6,4,0.78)' : (primary ? orange : dim),
          paddingTop: 4, minWidth: 30,
        }}>
          {String(idx).padStart(2, '0')}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            fontSize: primary ? 22 : 16,
            fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1.15,
          }}>{label}</div>
          {hint && (
            <div style={{
              fontSize: 12, lineHeight: 1.5,
              letterSpacing: '0.02em',
              color: 'rgba(8,6,4,0.85)',
              maxHeight: hover ? 80 : 0,
              opacity: hover ? 1 : 0,
              overflow: 'hidden',
              transform: hover ? 'translateY(0)' : 'translateY(-4px)',
              transition: 'max-height 220ms ease, opacity 180ms ease, transform 220ms ease',
            }}>{hint}</div>
          )}
        </div>
        <div style={{
          fontSize: 18, fontWeight: 700,
          color: hover ? '#080604' : (primary ? orange : dim),
          transform: hover ? 'translateX(6px)' : 'translateX(0)',
          transition: 'transform 160ms ease',
          paddingTop: primary ? 4 : 2,
        }}>
          ▸
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header (small caps with rule)
// ─────────────────────────────────────────────────────────────────────────────
function SectionHead({ k, title }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      marginBottom: 12,
    }}>
      <span style={{
        fontSize: 11, letterSpacing: '0.32em', fontWeight: 700,
        color: '#b86620',
      }}>// {k}</span>
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(184,102,32,0.55), rgba(184,102,32,0))' }}/>
      <span style={{
        fontSize: 11, letterSpacing: '0.18em', fontWeight: 700,
        color: '#8a7a66',
      }}>{title}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bottom rail
// ─────────────────────────────────────────────────────────────────────────────
function BottomRail({ onContact }) {
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, height: 38,
      borderTop: '1px solid rgba(255,144,48,0.28)',
      background: 'linear-gradient(0deg, rgba(8,6,4,0.92), rgba(8,6,4,0.55))',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px',
      fontSize: 11, letterSpacing: '0.16em', color: '#8a7a66', fontWeight: 700,
    }}>
      <div style={{ display: 'flex', gap: 22 }}>
        <span>SECURE LINK · TLS 1.3</span>
        <span style={{ opacity: 0.5 }}>│</span>
        <span>BLOCK <span style={{ color: '#f2efe8' }}>#1,492,031</span></span>
      </div>
      <div style={{ color: '#b86620' }}>PRESS <span style={{ color: '#ff9030' }}>[ESC]</span> TO LOG OFF</div>
      <div style={{ display: 'flex', gap: 22 }}>
        <span>HAVING ISSUES?</span>
        <span style={{ color: '#ff9030', cursor: 'pointer' }} onClick={onContact}>CONTACT US ▸</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Floating "My Registered SSUs" overlay
// ─────────────────────────────────────────────────────────────────────────────
function GhostBtn({ children, onClick, danger }) {
  const [hover, setHover] = React.useState(false);
  const c = danger ? '#ff5a30' : '#ff9030';
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '8px 16px',
        background: hover ? (danger ? 'rgba(255,90,48,0.14)' : 'rgba(255,144,48,0.14)') : 'transparent',
        border: `1px solid ${c}`,
        color: c,
        fontFamily: 'inherit',
        fontSize: 12,
        letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'background 120ms ease',
      }}>
      {children}
    </button>
  );
}

function SSURow({ ssu }) {
  const short = ssu.id.slice(0, 8) + '...' + ssu.id.slice(-6);
  const url = `https://notribe.bazaar.app/?ssuId=${ssu.id}`;
  return (
    <div style={{
      border: '1px solid #2e1f10',
      background: 'rgba(20,14,8,0.55)',
      padding: '20px 24px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 14,
      }}>
        <span style={{
          color: '#ff9030', fontWeight: 700, fontSize: 16, letterSpacing: '0.04em',
        }}>{short}</span>
        <span style={{
          padding: '3px 10px',
          background: 'rgba(58,210,120,0.18)',
          border: '1px solid #3ad278',
          color: '#3ad278',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
        }}>ACTIVE</span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto auto',
        alignItems: 'center', gap: 14,
      }}>
        <code style={{
          fontFamily: 'inherit', fontSize: 13, color: '#c8bda9',
          letterSpacing: '0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{url}</code>
        <GhostBtn onClick={() => navigator.clipboard?.writeText(url)}>Copy</GhostBtn>
        <GhostBtn danger>Unregister</GhostBtn>
      </div>
      <div style={{
        textAlign: 'center', fontSize: 12, color: '#8a7a66', letterSpacing: '0.04em',
      }}>Registered: 8. Mai 2026, 18:11</div>
    </div>
  );
}

function SSUOverlay({ open, onClose }) {
  const [tab, setTab] = React.useState('notribe');
  const noTribeSSUs = [{ id: '0xaac1cef8f3ff611d1042e9abe8ffc11d167cdad657460315ab8b6c8c0ed7957c' }];
  const tribeSSUs = [];

  // Esc closes
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const orange = '#ff9030';
  const Tab = ({ id, label }) => {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '12px 6px',
          marginRight: 28,
          fontFamily: 'inherit', fontWeight: 700,
          fontSize: 14, letterSpacing: '0.04em',
          color: active ? orange : '#8a7a66',
          cursor: 'pointer',
          borderBottom: active ? `2px solid ${orange}` : '2px solid transparent',
        }}>{label}</button>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        background: 'rgba(8,6,4,0.72)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 60px',
        animation: 'ssuFade 160ms ease-out',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1200px, 100%)',
          background: '#0e0a06',
          border: `1.5px solid ${orange}`,
          boxShadow: `0 0 0 1px rgba(255,144,48,0.12), 0 0 60px rgba(255,144,48,0.18), 0 24px 80px rgba(0,0,0,0.6)`,
          padding: '28px 32px 32px',
          position: 'relative',
          animation: 'ssuPop 200ms ease-out',
        }}>
        {/* corner brackets */}
        {[
          { top: -1, left: -1, borderWidth: '2px 0 0 2px' },
          { top: -1, right: -1, borderWidth: '2px 2px 0 0' },
          { bottom: -1, left: -1, borderWidth: '0 0 2px 2px' },
          { bottom: -1, right: -1, borderWidth: '0 2px 2px 0' },
        ].map((s, i) => (
          <span key={i} style={{
            position: 'absolute', width: 14, height: 14,
            borderColor: orange, borderStyle: 'solid', ...s,
          }}/>
        ))}

        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <h2 style={{
            margin: 0, fontFamily: 'inherit',
            fontSize: 18, fontWeight: 700, letterSpacing: '0.16em',
            color: orange,
          }}>MY REGISTERED SSUS</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: '#c8bda9', fontFamily: 'inherit', fontSize: 13,
              letterSpacing: '0.06em', cursor: 'pointer', padding: 4,
            }}>Close</button>
        </div>

        {/* tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid rgba(184,102,32,0.45)',
          marginBottom: 24,
        }}>
          <Tab id="notribe" label={`NoTribe SSUs (${noTribeSSUs.length})`} />
          <Tab id="tribe" label={`Tribe SSUs (${tribeSSUs.length})`} />
        </div>

        {/* body */}
        {tab === 'notribe' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {noTribeSSUs.map((s) => <SSURow key={s.id} ssu={s} />)}
          </div>
        )}
        {tab === 'tribe' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{
              border: '1px solid #b86620',
              padding: '16px 20px',
              display: 'flex', flexDirection: 'column', gap: 8,
              background: 'rgba(184,102,32,0.06)',
            }}>
              <div style={{ color: orange, fontWeight: 700, fontSize: 13, letterSpacing: '0.04em' }}>
                About tribe currency
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#c8bda9' }}>
                Your tribe currency is not stored in your wallet, but within the Bazaar network where it is registered to your wallet. To exchange tribe currency with EVE, you can only do so in Bazaar dApps that are part of that tribe's network and with that tribe's specific Escrow pool.
              </div>
            </div>
            <div style={{
              padding: '36px 20px', textAlign: 'center',
              fontSize: 16, color: '#c8bda9', letterSpacing: '0.02em',
            }}>You have no tribe-affiliated SSUs registered.</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes ssuFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ssuPop {
          from { opacity: 0; transform: translateY(8px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Floating "Contact / Support" overlay
// ─────────────────────────────────────────────────────────────────────────────
function ContactOverlay({ open, onClose }) {
  const orange = '#ff9030';
  const dim = '#b86620';
  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState('Bug');
  const [desc, setDesc] = React.useState('');
  const [contactBy, setContactBy] = React.useState('none');

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const cats = ['Bug', 'Feature Request', 'Other'];

  const fieldLabel = {
    fontSize: 12, letterSpacing: '0.04em', color: '#c8bda9',
    marginBottom: 8, display: 'block',
  };
  const counter = { color: '#8a7a66', fontWeight: 400 };
  const inputBase = {
    width: '100%',
    background: 'rgba(8,6,4,0.85)',
    border: `1px solid ${dim}`,
    color: '#f2efe8',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    fontSize: 14,
    letterSpacing: '0.02em',
    padding: '12px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
  };

  const Pill = ({ value }) => {
    const active = category === value;
    const [hover, setHover] = React.useState(false);
    return (
      <button
        type="button"
        onClick={() => setCategory(value)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: '8px 14px',
          background: active ? 'rgba(255,144,48,0.16)' : (hover ? 'rgba(255,144,48,0.08)' : 'transparent'),
          border: `1px solid ${active ? orange : dim}`,
          color: active ? orange : '#c8bda9',
          fontFamily: 'inherit',
          fontSize: 13,
          letterSpacing: '0.02em',
          cursor: 'pointer',
          transition: 'all 120ms ease',
        }}>{value}</button>
    );
  };

  const Radio = ({ value, label }) => {
    const active = contactBy === value;
    return (
      <button
        type="button"
        onClick={() => setContactBy(value)}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: 4, fontFamily: 'inherit',
          color: active ? orange : '#c8bda9',
          fontSize: 13, letterSpacing: '0.02em',
        }}>
        <span style={{
          width: 14, height: 14, borderRadius: '50%',
          border: `1.5px solid ${active ? orange : dim}`,
          display: 'inline-grid', placeItems: 'center',
          background: active ? 'rgba(255,144,48,0.12)' : 'transparent',
        }}>
          {active && <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: orange,
            boxShadow: `0 0 6px ${orange}`,
          }}/>}
        </span>
        {label}
      </button>
    );
  };

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
          width: 'min(760px, calc(100% - 80px))',
          background: '#0e0a06',
          border: `1.5px solid ${orange}`,
          boxShadow: `0 0 0 1px rgba(255,144,48,0.12), 0 0 60px rgba(255,144,48,0.18), 0 24px 80px rgba(0,0,0,0.6)`,
          padding: '28px 32px 30px',
          position: 'relative',
          animation: 'ssuPop 200ms ease-out',
        }}>
        {/* corner brackets */}
        {[
          { top: -1, left: -1, borderWidth: '2px 0 0 2px' },
          { top: -1, right: -1, borderWidth: '2px 2px 0 0' },
          { bottom: -1, left: -1, borderWidth: '0 0 2px 2px' },
          { bottom: -1, right: -1, borderWidth: '0 2px 2px 0' },
        ].map((s, i) => (
          <span key={i} style={{
            position: 'absolute', width: 14, height: 14,
            borderColor: orange, borderStyle: 'solid', ...s,
          }}/>
        ))}

        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 22,
        }}>
          <h2 style={{
            margin: 0, fontFamily: 'inherit',
            fontSize: 18, fontWeight: 700, letterSpacing: '0.16em',
            color: orange,
          }}>CONTACT / SUPPORT</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: '#c8bda9', fontFamily: 'inherit', fontSize: 13,
              letterSpacing: '0.06em', cursor: 'pointer', padding: 4,
            }}>Close</button>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabel}>
            Title <span style={counter}>({title.length}/100)</span>
          </label>
          <input
            type="text"
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief summary of your issue..."
            style={inputBase}
          />
        </div>

        {/* Category */}
        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabel}>Category</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {cats.map((c) => <Pill key={c} value={c} />)}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 18 }}>
          <label style={fieldLabel}>
            Description <span style={counter}>({desc.length}/1000)</span>
          </label>
          <textarea
            maxLength={1000}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe your issue in detail..."
            rows={5}
            style={{ ...inputBase, resize: 'vertical', minHeight: 120, lineHeight: 1.55 }}
          />
        </div>

        {/* Contact method */}
        <div style={{ marginBottom: 22 }}>
          <label style={fieldLabel}>Preferred Contact Method</label>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Radio value="none" label="No contact needed" />
            <Radio value="discord" label="Discord" />
            <Radio value="email" label="Email" />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end',
          alignItems: 'center', gap: 14,
          paddingTop: 6,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: '#c8bda9', fontFamily: 'inherit', fontSize: 13,
              letterSpacing: '0.06em', cursor: 'pointer', padding: '10px 14px',
            }}>Cancel</button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '11px 20px',
              background: 'rgba(255,144,48,0.16)',
              border: `1px solid ${orange}`,
              color: orange,
              fontFamily: 'inherit',
              fontSize: 13,
              letterSpacing: '0.04em',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 0 18px rgba(255,144,48,0.2)',
            }}>Submit Ticket</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hub layout
// ─────────────────────────────────────────────────────────────────────────────
function Hub() {
  const [ssuOpen, setSsuOpen] = React.useState(false);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [advTribeOpen, setAdvTribeOpen] = React.useState(false);
  const [stdTribeOpen, setStdTribeOpen] = React.useState(false);
  const [joinTribeOpen, setJoinTribeOpen] = React.useState(false);
  const [regSsuOpen, setRegSsuOpen] = React.useState(false);
  return (
    <React.Fragment>
      <TopBar />
      {/* main content area, padded under the topbar / above the rail */}
      <div style={{
        position: 'absolute',
        top: 44, left: 0, right: 0, bottom: 38,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      }}>
        <div style={{
          width: 1180,
          display: 'flex', flexDirection: 'column', gap: 22,
          paddingTop: 48, paddingBottom: 24,
        }}>
          <Hero />
          <StatStrip />

          {/* Mid band — register/forge flank the eye, which renders in the
              transparent center column from the matrix-rain canvas. */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 340px 1fr',
            gap: 28, alignItems: 'center',
            minHeight: 280, marginTop: 12,
          }}>
            {/* LEFT — Tier 1: REGISTER */}
            <div>
              <SectionHead k="01" title="REGISTER · SSU" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ActionCard
                  idx={1}
                  primary
                  label="Register Just for Me"
                  hint="Solo registration. Your SSU, your inventory, your prices."
                  onClick={() => setRegSsuOpen(true)}
                />
                <ActionCard
                  idx={2}
                  label="Create a Bazaar Tribe"
                  hint="Standard tribe contract. Members, treasury, shopfronts."
                  style={{ marginTop: 38, marginLeft: 28 }}
                  onClick={() => setStdTribeOpen(true)}
                />
              </div>
            </div>

            {/* CENTER — empty: eye lives in the rain behind this column */}
            <div aria-hidden="true" />

            {/* RIGHT — Tier 2: FORGE */}
            <div>
              <SectionHead k="02" title="FORGE · TRIBE" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ActionCard
                  idx={3}
                  primary
                  label="Register to a Tribe"
                  hint="Join your tribe's shared bazaar. Pooled storefronts and tribute."
                  onClick={() => setJoinTribeOpen(true)}
                />
                <ActionCard
                  idx={4}
                  label="Create an Advanced Tribe"
                  hint={<span><span style={{ color: '#ff5a30' }}>⚠ Experimental</span> · Custom roles, fee splits, governance hooks.</span>}
                  style={{ marginTop: 38, marginRight: 28 }}
                  onClick={() => setAdvTribeOpen(true)}
                />
              </div>
            </div>
          </div>

          {/* Tier 3 — manage (below the eye, full width) */}
          <div style={{ marginTop: 56 }}>
            <div style={{ maxWidth: 780, margin: '0 auto' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                marginBottom: 12,
              }}>
                <span style={{ fontSize: 11, letterSpacing: '0.32em', fontWeight: 700, color: '#b86620' }}>// 03</span>
                <span style={{ fontSize: 11, letterSpacing: '0.18em', fontWeight: 700, color: '#8a7a66' }}>MANAGE</span>
                <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(184,102,32,0.55), rgba(184,102,32,0))' }}/>
              </div>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 14, maxWidth: 780, margin: '0 auto',
            }}>
              <ActionCard idx={5} label="My Registered SSUs" hint="View, edit, deregister." onClick={() => setSsuOpen(true)} />
              <ActionCard idx={6} label="Contact Us" hint="Report a bug, share feedback, or pitch us your wildest ideas." onClick={() => setContactOpen(true)} />
            </div>
            <div style={{
              maxWidth: 780, margin: '0 auto',
              display: 'flex', justifyContent: 'space-between',
              marginTop: 56,
            }}>
              <div style={{ width: 'calc(50% - 7px)', marginLeft: -160 }}>
                <ActionCard idx={8} label="My registered Bazaar not loading? Click here" hint="Resync the indexer and refresh your on-chain registry." onClick={() => setSsuOpen(true)} />
              </div>
              <div style={{ width: 'calc(50% - 7px)', marginRight: -160 }}>
                <ActionCard idx={7} label="DApp Management" hint="Permissions and connected modules." />
              </div>
            </div>
          </div>
        </div>
      </div>
      <BottomRail onContact={() => setContactOpen(true)} />

      <SSUOverlay open={ssuOpen} onClose={() => setSsuOpen(false)} />
      <ContactOverlay open={contactOpen} onClose={() => setContactOpen(false)} />
      <window.AdvancedTribeOverlay open={advTribeOpen} onClose={() => setAdvTribeOpen(false)} />
      <window.StandardTribeOverlay open={stdTribeOpen} onClose={() => setStdTribeOpen(false)} />
      <window.JoinTribeOverlay open={joinTribeOpen} onClose={() => setJoinTribeOpen(false)} />
      <window.RegisterSSUOverlay open={regSsuOpen} onClose={() => setRegSsuOpen(false)} />

      {/* shared keyframes */}
      <style>{`
        @keyframes hubScan {
          0%   { transform: translateY(0); opacity: 0.0; }
          15%  { opacity: 0.85; }
          50%  { transform: translateY(100%); opacity: 0.85; }
          100% { transform: translateY(100%); opacity: 0; }
        }
      `}</style>
    </React.Fragment>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────
function App() {
  return (
    <Stage>
      {/* full-bleed matrix backdrop */}
      <window.MatrixBackdrop />
      {/* HUD frame chrome (corner brackets + side notches) */}
      <window.MatrixFrameChrome />
      {/* hub UI */}
      <Hub />
    </Stage>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
