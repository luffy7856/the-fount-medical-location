import type { GrowthForecast } from "@/data/location-types";

const series = [
  { key: "residentPopulation", label: "거주인구", unit: "명", color: "#087f78" },
  { key: "workerPopulation", label: "종사자", unit: "명", color: "#287ac1" },
  { key: "businesses", label: "사업체", unit: "개", color: "#8054b5" },
] as const;

export function ForecastLines({ forecast }: { forecast: GrowthForecast }) {
  const history = [...forecast.historical].sort((a, b) => a.year - b.year);
  const projected = [...forecast.projected].sort((a, b) => a.year - b.year);
  const points = [...history, ...projected];
  if (!history.length || !projected.length) return null;
  const firstYear = points[0].year;
  const lastYear = points.at(-1)!.year;
  const x = (year: number) => 60 + (year - firstYear) / Math.max(1, lastYear - firstYear) * 350;
  return <section className="forecast-lines" aria-label="실측 통계와 향후 3년 추정 선그래프">
    <h3>숫자로 보는 변화 흐름</h3>
    <p>실선: 실제 통계 · 점선: 추정치 · 세로축은 0부터 시작합니다.</p>
    {series.map(({ key, label, unit, color }) => {
      const max = Math.max(1, ...points.map(point => point[key])) * 1.15;
      const y = (value: number) => 164 - value / max * 118;
      const path = (rows: typeof points) => rows.map(point => `${x(point.year)},${y(point[key])}`).join(" ");
      return <figure key={key}>
        <figcaption><b>{label}</b><span>단위: {unit}</span></figcaption>
        <svg viewBox="0 0 450 206" role="img" aria-label={`${label}: ${points.map(p => `${p.year}년 ${p[key].toLocaleString()}${unit} ${p.kind === "observed" ? "실측" : "추정"}`).join(", ")}`}>
          {[0, .5, 1].map(ratio => <g key={ratio}><line x1="60" x2="420" y1={y(max * ratio)} y2={y(max * ratio)} stroke="#e1e7eb" /><text x="52" y={y(max * ratio) + 4} textAnchor="end">{Math.round(max * ratio).toLocaleString()}</text></g>)}
          <polyline points={path(history)} fill="none" stroke={color} strokeWidth="3" />
          <polyline points={path([history.at(-1)!, ...projected])} fill="none" stroke={color} strokeWidth="3" strokeDasharray="6 5" />
          {points.map(point => <g key={point.year}>
            <circle cx={x(point.year)} cy={y(point[key])} r="4" fill={point.kind === "observed" ? color : "white"} stroke={color} strokeWidth="2"><title>{`${point.year}: ${point[key].toLocaleString()}${unit}`}</title></circle>
            <text x={x(point.year)} y={y(point[key]) - 12} textAnchor="middle" className="chart-value">{point[key].toLocaleString()}</text>
            <text x={x(point.year)} y="188" textAnchor="middle">{point.year}</text>
          </g>)}
        </svg>
      </figure>;
    })}
  </section>;
}
