import { useEffect, useRef, useState } from 'react';
import type { ComponentView, DocumentView } from './model';
import type { SessionResult } from './simulation/provenance';
import { PhysicalStatistics, StabilityStatistics, FlightStatistics } from './PreviewStatistics';
import {displayLength, metresFromLength, lengthLabel, type LengthUnit} from './units';
export function RocketDrawing({ document, results, components, selected, select, busy, unit, edit }: {
  document: DocumentView; results: Record<string, SessionResult>; components: ComponentView[]; selected: number; select: (index: number) => void; busy: boolean; unit: LengthUnit; edit: () => void;
}) {
  const { drawing, stability } = document;
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 1000, height: 300 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const height = Math.max(80, 1000 * viewport.height / viewport.width);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = () => {
      const box = element.getBoundingClientRect();
      if (element.clientWidth) setViewport({ width: box.width - (element.offsetWidth - element.clientWidth), height: box.height - (element.offsetHeight - element.clientHeight) });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element); resize();
    return () => observer.disconnect();
  }, [drawing.error]);
  const scale = Math.min(900 / (drawing.maxX - drawing.minX), (height - 36) / 2 / Math.max(drawing.radius, 0.001));
  const left = (1000 - (drawing.maxX - drawing.minX) * scale) / 2;
  const x = (value: number) => left + (value - drawing.minX) * scale;
  const y = (value: number) => 150 - value * scale;
  const screenScale = zoom * Math.min(viewport.width / 1000, viewport.height / height);
  const screenOffset = (viewport.width * zoom - 1000 * screenScale) / 2 - scrollLeft;
  const rulerTarget = displayLength(100 / scale, unit);
  const rulerPower = 10 ** Math.floor(Math.log10(rulerTarget));
  const rulerMultiple = [1, 2, 5, 10].find(value => value * rulerPower >= rulerTarget)!;
  const rulerDivisions = rulerMultiple === 2 ? 4 : 5;
  const rulerStep = rulerMultiple * rulerPower / rulerDivisions;
  const firstTick = Math.ceil(displayLength(drawing.minX, unit) / rulerStep - 1e-9);
  const lastTick = Math.floor(displayLength(drawing.maxX, unit) / rulerStep + 1e-9);
  const rulerTicks = Array.from({ length: Math.max(0, lastTick - firstTick + 1) }, (_, i) => {
    const index = firstTick + i, value = index * rulerStep;
    return { value, position: metresFromLength(value, unit), major: index % rulerDivisions === 0 };
  });
  return <section className="rocket-drawing" aria-label="Rocket drawing">
    {!drawing.error && <svg className="drawing-ruler" aria-label={`Rocket ruler (${unit})`}>
        <g data-testid="rocket-ruler">
          <line x1={screenOffset + x(drawing.minX) * screenScale} x2={screenOffset + x(drawing.maxX) * screenScale} y1="0" y2="0" stroke="currentColor" strokeWidth=".5"/>
          {rulerTicks.map(tick => <g key={tick.value} data-position={tick.position} data-major={tick.major} transform={`translate(${screenOffset + x(tick.position) * screenScale} 0)`}>
            <line y1="0" y2={tick.major ? '.4rem' : '.2rem'} stroke="currentColor" strokeWidth=".5"/>
            {tick.major && <text className="ruler-number" x="0" y="1.25rem" textAnchor="middle">{Number(tick.value.toPrecision(12))}</text>}
          </g>)}
        </g>
      </svg>}
    <div className="drawing-title"><PhysicalStatistics stats={stability} unit={unit}/><StabilityStatistics stats={stability} unit={unit}/></div>
    {drawing.error ? <p>{drawing.error}</p> : <>
      <div ref={canvas} className="drawing-canvas" onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}><svg style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 100}%`, height: `${zoom * 100}%` }} viewBox={`0 0 1000 ${height}`} role="img" aria-label="Rocket side drawing with internal components: select a component to edit">
        <g transform={`translate(0 ${(height + 20) / 2 - 150})`}><line x1="35" x2="965" y1="150" y2="150" stroke="#8298a6" strokeDasharray="5 5"/>
        {drawing.polygons.map((polygon, i) => {
          const index = drawing.componentIndices[polygon.index], component = components[index];
          return <polygon key={i} data-testid={`rocket-part-${component.id}`} points={polygon.points.map(([a,b]) => `${x(a)},${y(b)}`).join(' ')}
            fill={selected === index ? 'var(--drawing-selected)' : 'var(--drawing-fill)'}
            stroke={selected === index ? 'var(--drawing-selected-stroke)' : 'var(--drawing-stroke)'} strokeWidth={selected === index ? 3 : 1.5}
            tabIndex={busy ? -1 : 0} role="button" aria-label={`Select ${component.name} in drawing`} aria-pressed={selected === index}
            onClick={() => !busy && select(index)} onDoubleClick={() => !busy && edit()} onKeyDown={event => { if (!busy && ['Enter',' '].includes(event.key)) { event.preventDefault(); select(index); } }}>
            <title>{component.name} · {component.type}</title>
          </polygon>;
        })}
        {drawing.internals?.map((shape, i) => {
          const index = components.findIndex(component => component.id === shape.id), component = components[index];
          if (!component) return null;
          const packed = ['mass', 'parachute', 'streamer', 'cord'].includes(shape.kind);
          const left = x(shape.x), top = y(shape.y + shape.radius), width = shape.length * scale, size = shape.radius * 2 * scale;
          return <g key={`${shape.id}-${i}`} className={`internal-component internal-${shape.kind}`} data-testid={`rocket-internal-${shape.id}`} data-kind={shape.kind}
            data-geometry={JSON.stringify(shape)} stroke={selected === index ? 'var(--drawing-selected-stroke)' : 'var(--drawing-stroke)'} strokeWidth={selected === index ? 2.5 : 1.2} strokeDasharray={shape.kind === 'motor' ? undefined : '5 3'}
            fill="none" pointerEvents="visibleStroke" role="button" tabIndex={busy ? -1 : 0} aria-pressed={selected === index} aria-label={`Select ${component.name} ${shape.kind} in drawing`}
            onClick={() => !busy && select(index)} onDoubleClick={() => !busy && edit()} onKeyDown={event => { if (!busy && ['Enter', ' '].includes(event.key)) { event.preventDefault(); select(index); } }}>
            <title>{component.name} · {shape.kind}</title>
            <rect x={left} y={top} width={width} height={size} rx={packed ? Math.min(width, size) * .35 : 0}/>
            {shape.kind === 'tube' && shape.innerRadius > 0 && shape.radius - shape.innerRadius >= .0012 && <rect x={left} y={y(shape.y + shape.innerRadius)} width={width} height={shape.innerRadius * 2 * scale} fill="none"/>}
            {shape.kind === 'parachute' && <path d={`M${left + width * .3} ${top + size * .4}q${width * .2} ${-size * .4} ${width * .4} 0l${-width * .2} ${size * .4}z`} fill="none" strokeDasharray="none"/>}
            {shape.kind === 'cord' && <path d={`M${left + width * .15} ${top + size / 2}q${width * .175} ${-size * .6} ${width * .35} 0t${width * .35} 0`} fill="none" strokeDasharray="none"/>}
          </g>;
        })}
        {([['cg', stability.cg, '#56b4e9'], ['cp', stability.cp, '#e69f00']] as const).map(([kind, value, color]) => value != null && Number.isFinite(value) && <g key={kind} data-testid={`rocket-${kind}`} data-position={value} transform={`translate(${x(value)} 150) scale(0.75)`} pointerEvents="none" aria-label={`${kind === 'cg' ? 'Center of gravity' : 'Center of pressure'}: ${lengthLabel(value, unit)}`}>
          <circle r="9" fill="#171a20" stroke={color} strokeWidth="2"/>
          {kind === 'cg' ? <path d="M-9 0H9M0-9V9M0 0H9A9 9 0 0 0 0-9ZM0 0H-9A9 9 0 0 0 0 9Z" fill={color} stroke={color}/> : <><circle r="3" fill={color}/><path d="M-13 0H-9M9 0H13M0-13V-9M0 9V13" stroke={color} strokeWidth="2"/></>}
        </g>)}
        </g>
      </svg></div>
      <p className="drawing-selection">Selected: <strong>{components[selected]?.name}</strong>. Click to select · Double-click to edit · Enter / Space to select with keyboard.</p>
    </>}
    <div className="drawing-footer"><FlightStatistics document={document} results={results} unit={unit}/><div className="zoom-controls"><button aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom(Math.max(.5, zoom - .25))}>−</button><button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}% · Fit</button><button aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .25))}>+</button></div></div>
    {!!drawing.omitted.length && <details><summary>Parts omitted from the side view ({drawing.omitted.length})</summary><ul>{drawing.omitted.map((text,i) => <li key={i}>{text}</li>)}</ul></details>}
  </section>;
}
