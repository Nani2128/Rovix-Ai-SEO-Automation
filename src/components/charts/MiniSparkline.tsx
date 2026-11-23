export function MiniSparkline({
  points,
  color = '#635BFF',
}: {
  points: number[];
  color?: string;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const width = 68;
  const height = 24;

  const coords = points.map((val, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((val - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${coords.join(' L ')}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <path
        d={pathD}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
