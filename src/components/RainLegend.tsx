const ITEMS = [
  { risk: "low", label: "雨の心配なし", color: "#22c55e" },
  { risk: "medium", label: "雨の可能性あり", color: "#eab308" },
  { risk: "high", label: "雨の可能性が高い", color: "#ef4444" },
] as const;

export function RainLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      {ITEMS.map((item) => (
        <span key={item.risk} className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
