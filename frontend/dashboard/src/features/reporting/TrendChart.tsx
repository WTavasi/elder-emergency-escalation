import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { DailyPoint } from '../../shared/api/types';
import { formatDuration } from '../../shared/utils/format';

export type Series = 'raised' | 'median';

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 44 };
const dayLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

function parseDay(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/**
 * The top of the axis, chosen so its four steps are whole: whole emergencies for a
 * count, which cannot be three and three quarters, and quarter minutes for a wait.
 */
function axisTop(value: number, series: Series): number {
  const unit = series === 'raised' ? 1 : 15;
  const step = Math.max(unit, Math.ceil(value / 4 / unit) * unit);
  return step * 4;
}

function valueOf(point: DailyPoint, series: Series): number | null {
  return series === 'raised' ? point.raised : point.medianSeconds;
}

function format(value: number, series: Series): string {
  return series === 'raised' ? String(value) : formatDuration(value);
}

/**
 * One line over the window, a day per point: emergencies raised, or the median time to
 * an answer. One series at a time and one colour, the ink, with a faint fill beneath it;
 * the grid is dashed and quiet so the line is the only thing that reads first.
 *
 * Drawn in SVG rather than with a charting library: one line chart does not justify a
 * dependency in a console that loads nothing it does not need. Hovering, or the arrow
 * keys once the chart has focus, shows the exact figure for a day. A table of the same
 * figures sits underneath for a screen reader, since a picture of a line says nothing
 * to one.
 *
 * Days with no answered emergency have no median. Rather than pretending the wait was
 * zero, each day that has one is a dot, and a dashed line bridges the days that do not,
 * so the eye can still follow the trend without being told it was measured there.
 */
export function TrendChart({ points, series }: { points: DailyPoint[]; series: Series }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(280, element.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const values = points.map((point) => valueOf(point, series));
  const top = axisTop(Math.max(0, ...values.map((value) => value ?? 0)), series);
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const x = (index: number) => PAD.left + index * step;
  const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;

  const known = values.flatMap((value, index) => (value === null ? [] : [{ index, value }]));
  const line = known.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.index)},${y(p.value)}`).join(' ');
  const area =
    known.length > 1
      ? `${line} L${x(known.at(-1)!.index)},${y(0)} L${x(known[0]!.index)},${y(0)} Z`
      : '';
  // Pairs of neighbouring known days with a day or more missing between them.
  const bridges = known.slice(1).flatMap((p, i) => {
    const before = known[i]!;
    return p.index - before.index > 1 ? [{ from: before, to: p }] : [];
  });

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((share) => share * top);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  function pick(clientX: number) {
    const left = frame.current?.getBoundingClientRect().left ?? 0;
    const index = Math.round((clientX - left - PAD.left) / (step || 1));
    setActive(Math.min(points.length - 1, Math.max(0, index)));
  }

  const shown = active === null ? null : points[active];
  const shownValue = shown ? valueOf(shown, series) : null;

  return (
    <div className="chart" ref={frame}>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={
          series === 'raised'
            ? 'Emergencies raised each day. The figures are in the table that follows.'
            : 'Median time to an answer each day. The figures are in the table that follows.'
        }
        tabIndex={0}
        onMouseMove={(moveEvent) => pick(moveEvent.clientX)}
        onMouseLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key !== 'ArrowLeft' && keyEvent.key !== 'ArrowRight') return;
          keyEvent.preventDefault();
          const delta = keyEvent.key === 'ArrowLeft' ? -1 : 1;
          setActive((was) =>
            Math.min(points.length - 1, Math.max(0, (was ?? points.length - 1) + delta)),
          );
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className="chart__grid"
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="chart__axis" x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
              {series === 'raised' ? tick : tick === 0 ? '0' : formatDuration(tick)}
            </text>
          </g>
        ))}

        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text
              key={point.date}
              className="chart__axis"
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            >
              {dayLabel.format(parseDay(point.date))}
            </text>
          ) : null,
        )}

        {series === 'raised' && area ? <path d={area} fill={`url(#${gradientId})`} /> : null}
        {series === 'raised' ? (
          <path className="chart__line" d={line} />
        ) : (
          <>
            {known
              .slice(1)
              .map((p, i) =>
                p.index - known[i]!.index === 1 ? (
                  <line
                    key={p.index}
                    className="chart__line"
                    x1={x(known[i]!.index)}
                    y1={y(known[i]!.value)}
                    x2={x(p.index)}
                    y2={y(p.value)}
                  />
                ) : null,
              )}
            {bridges.map(({ from, to }) => (
              <line
                key={`gap-${to.index}`}
                className="chart__line chart__line--gap"
                x1={x(from.index)}
                y1={y(from.value)}
                x2={x(to.index)}
                y2={y(to.value)}
              />
            ))}
            {known.map((p) => (
              <circle key={p.index} className="chart__dot" cx={x(p.index)} cy={y(p.value)} r={3} />
            ))}
          </>
        )}

        {active !== null ? (
          <g>
            <line
              className="chart__cursor"
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
            />
            {shownValue !== null ? (
              <circle className="chart__point" cx={x(active)} cy={y(shownValue)} r={4} />
            ) : null}
          </g>
        ) : null}
      </svg>

      {shown && active !== null ? (
        <div
          className="chart__tip"
          role="status"
          style={{
            left: Math.min(Math.max(x(active), 80), width - 80),
          }}
        >
          <div className="chart__tip-date">{dayLabel.format(parseDay(shown.date))}</div>
          <div className="chart__tip-value mono">
            {shownValue === null ? 'No answer that day' : format(shownValue, series)}
          </div>
          <div className="chart__tip-detail">
            {shown.raised} raised, {shown.acknowledged} answered
          </div>
        </div>
      ) : null}

      <table className="visually-hidden">
        <caption>
          {series === 'raised' ? 'Emergencies raised' : 'Median time to an answer'}, by day
        </caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Raised</th>
            <th scope="col">Answered</th>
            <th scope="col">Median time to an answer</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <td>{point.date}</td>
              <td>{point.raised}</td>
              <td>{point.acknowledged}</td>
              <td>{point.medianSeconds === null ? 'none' : formatDuration(point.medianSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
