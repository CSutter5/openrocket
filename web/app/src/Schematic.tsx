import type { ComponentView } from './model';
import {displayLength, lengthLabel, type LengthUnit} from './units';
export function Schematic({ component, unit }: { component: ComponentView; unit: LengthUnit }) {
  if (!component.tube) return <p>No schematic for this component: {component.radiusReason} Unsupported shapes are omitted.</p>;
  const { input, state } = component.tube;
  const scale = Math.min(560 / input.length, 120 / (2 * state.radius));
  const x = 55, y = 135, length = input.length * scale, radius = state.radius * scale;
  const inner = (state.radius - state.thickness) * scale;
  const ring = 'ring' in state ? state.ring : undefined;
  return <>
    <svg viewBox="0 0 680 270" role="img" aria-label={`Local side schematic of ${component.name}: length ${displayLength(input.length, unit)} ${unit}, outer radius ${displayLength(state.radius, unit)} ${unit}`}>
      <title>Selected BodyTube, local side schematic; no whole-rocket positioning</title>
      <line x1="35" x2="645" y1={y} y2={y} stroke="#6a7f8c" strokeDasharray="6 5"/>
      <rect data-testid="tube-outline" x={x} y={y-radius} width={length} height={2*radius} fill="#e5f3fc" stroke="#0072b2" strokeWidth="2"/>
      {!input.filled && <rect x={x} y={y-inner} width={length} height={2*inner} fill="white" stroke="#6a7f8c" strokeDasharray="4 3"/>}
      {ring && <rect x={x + input.ring!.axialOffset * scale} y={y-ring.outerRadius*scale} width={ring.length*scale} height={2*ring.outerRadius*scale} fill="none" stroke="#172b3a" strokeWidth="2"/>}
      <path d={`M ${x+state.cg*scale} ${y-8} l 8 8 l -8 8 l -8 -8 Z`} fill="#a85600"/>
      <text x={x+state.cg*scale} y={y+radius+26} textAnchor="middle">Intrinsic CG: {lengthLabel(state.cg, unit)}</text>
      <text x={x} y="30">{component.name} · selected tube only</text>
      <text x={x} y="55">Outer radius: {lengthLabel(state.radius, unit)} · wall: {lengthLabel(state.thickness, unit)}</text>
      <text x={x} y="240">Length: {lengthLabel(input.length, unit)} · local x = 0 at left</text>
    </svg>
    <p className="muted">Outline and diamond use Java intrinsic radius, wall and local CG. Length is the explicit imported input. {ring ? 'The supported automatic ring is outlined at its local offset. ' : ''}Other shapes and whole-rocket placement are omitted.</p>
  </>;
}
