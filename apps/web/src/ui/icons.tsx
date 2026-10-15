// Authored icons, one stroke weight, drawn for the ledger (no emoji or glyph stand-ins).
const paths: Record<string, string> = {
  weapons: "M3 9h10l2-2h4v4h-3l-1 2H9l-1 4H5l1-4H3z",
  ammunition: "M7 4h3v3H7zM7 7v13h3V7M14 4h3v3h-3zM14 7v13h3V7",
  alcohol: "M10 3h4v4l2 3v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10l2-3zM8 13h8",
  dollar:
    "M12 3v18M16 7.5c-.8-1.2-2.2-2-4-2-2.2 0-4 1.2-4 3s1.8 2.6 4 3 4 1.3 4 3.2-1.8 3-4 3c-1.8 0-3.3-.8-4.1-2.1",
};

export function Icon({ name, label }: { name: string; label?: string }) {
  return (
    <svg
      className="ico"
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={paths[name] ?? ""} />
    </svg>
  );
}
