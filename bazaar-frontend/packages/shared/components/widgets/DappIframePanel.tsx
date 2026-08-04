// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

interface Props {
  name: string;
  url: string;
  onClose: () => void;
}

export default function DappIframePanel({ name, url, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="dapp-iframe-panel" onClick={e => e.stopPropagation()}>
        <div className="dapp-iframe-panel__header">
          <h3>{name}</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ color: "#cc7000" }}>
            X
          </button>
        </div>
        <iframe
          src={url}
          style={{ border: "none", flex: 1, width: "100%" }}
          sandbox="allow-scripts allow-forms allow-popups"
          title={name}
        />
      </div>
    </div>
  );
}

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
