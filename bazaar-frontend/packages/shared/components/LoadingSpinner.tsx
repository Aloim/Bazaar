/**
 * LoadingSpinner.tsx — Minimal loading indicator.
 *
 * Renders a small animated spinner using the accent colour.
 * Used across all apps when data fetching is in progress.
 *
 * File limit: 500 lines | Constitution Article XIV.2
 */

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

const SIZE_MAP = { sm: "1rem", md: "1.5rem", lg: "2.5rem" } as const;

export default function LoadingSpinner({
  size = "md",
  label = "Loading...",
}: LoadingSpinnerProps) {
  const dim = SIZE_MAP[size];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
        color: "var(--muted)",
        fontSize: "0.8rem",
      }}
      role="status"
      aria-label={label}
    >
      <div
        style={{
          width: dim,
          height: dim,
          border: "2px solid rgba(204, 112, 0, 0.2)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
          animation: "bazaar-spin 0.7s linear infinite",
        }}
      />
      {label && <span>{label}</span>}
    </div>
  );
}
