import { useContext } from 'react';
import type { DocumentView } from './model';
import type { SessionResult } from './simulation/provenance';
import { PreferencesContext } from './PreferencesContext';
import { preferredUnit, type Preferences } from './preferences';
import { lengthLabel, type LengthUnit } from './units';

export function previewFlight(document: DocumentView, results: Record<string, SessionResult>) {
  // Desktop uses the first simulation with the selected configuration ID.
  const saved = document.simulations.find(row => !!document.flightConfigurationId && row.configurationId === document.flightConfigurationId);
  const result = saved && results[saved.id];
  if (result && result.provenance.configurationId === document.flightConfigurationId && result.provenance.simulationId === saved.id) {
    const current = result.provenance.archiveTreeHash === document.hash && result.provenance.identitySidecarHash === document.identitySidecarHash;
    return { summary: result.flight.summary, acceleration: result.flight.maxAcceleration, status: current ? 'Completed' : 'Outdated result', simulation: saved.name };
  }
  return { summary: saved?.summary ?? [], acceleration: saved?.maxAcceleration,
    status: !saved || saved.status === 'not_simulated' ? 'Not run' : saved.status === 'outdated' ? 'Outdated result' : 'Stored result', simulation: saved?.name };
}
const number = (value: number) => Number(value.toPrecision(4)).toLocaleString(undefined, { maximumSignificantDigits: 4 });
const available = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
const quantity = (value: number | null | undefined, unit: { factor: number; id: string }) => available(value) ? `${number(value / unit.factor)} ${unit.id}` : 'Unavailable';
export function stabilityLabel(stats: DocumentView['stability'], preferences: Preferences | null) {
  if (!available(stats.cg) || !available(stats.cp)) return 'Unavailable';
  const margin = stats.cp - stats.cg;
  const convert = (key: 'STABILITY' | 'SECONDARY_STABILITY', fallback: string) => {
    const unit = preferredUnit(preferences, key, fallback);
    const reference = unit.id === 'cal' ? stats.caliber : unit.id === '%' ? stats.aerodynamicLength : 1;
    return available(reference) && reference > 0 ? quantity(margin / reference, unit) : 'Unavailable';
  };
  const primary = convert('STABILITY', 'cal');
  return (preferences?.displaySecondaryStability ?? true) && (preferences?.units.STABILITY ?? 'cal') !== (preferences?.units.SECONDARY_STABILITY ?? '%')
    ? `${primary} / ${convert('SECONDARY_STABILITY', '%')}` : primary;
}
export function PhysicalStatistics({ stats, unit }: { stats: DocumentView['stability']; unit: LengthUnit }) {
  const preferences = useContext(PreferencesContext), mass = preferredUnit(preferences, 'MASS', 'g');
  return <div className="physical-statistics" aria-label="Physical properties"><h2>Physical properties</h2>
    <p>Length: <strong data-testid="preview-length">{available(stats.length) ? lengthLabel(stats.length, unit) : 'Unavailable'}</strong> · Max. diameter: <strong data-testid="preview-diameter">{available(stats.diameter) ? lengthLabel(stats.diameter, unit) : 'Unavailable'}</strong></p>
    <p>Mass without motors: <strong data-testid="preview-dry-mass">{quantity(stats.massWithoutMotors, mass)}</strong></p>
    <p>Mass with motors: <strong data-testid="preview-launch-mass">{quantity(stats.massWithMotors, mass)}</strong></p>
  </div>;
}
export function StabilityStatistics({ stats, unit }: { stats: DocumentView['stability']; unit: LengthUnit }) {
  const preferences = useContext(PreferencesContext);
  return <div className="stability-statistics" aria-label="Rocket stability" title={stats.reason ?? 'Locations from rocket origin. Launch mass; CP at Mach 0.3, 0° angle of attack.'}>
    <p>Stability: <strong data-testid="preview-stability">{stabilityLabel(stats, preferences)}</strong></p>
    <p><span className="cg-label">⊕</span> CG: <strong>{available(stats.cg) ? lengthLabel(stats.cg, unit) : 'Unavailable'}</strong></p>
    <p><span className="cp-label">⊙</span> CP: <strong>{available(stats.cp) ? lengthLabel(stats.cp, unit) : 'Unavailable'}</strong></p>
    <p className="muted">Mach 0.3 · 0° AOA · From origin</p>
    {stats.reason && <p className="muted">{stats.reason}</p>}
  </div>;
}
export function FlightStatistics({ document, results, unit }: { document: DocumentView; results: Record<string, SessionResult>; unit: LengthUnit }) {
  const preferences = useContext(PreferencesContext), flight = previewFlight(document, results);
  const configuration = document.flightConfigurations.find(row => row.id === document.flightConfigurationId);
  return <div className="flight-statistics" aria-label="Selected configuration statistics">
    <p>Flight configuration: <strong>{configuration?.label ?? 'No configuration selected'}</strong></p>
    <p>Apogee: <strong data-testid="preview-apogee">{available(flight.summary[0]) ? lengthLabel(flight.summary[0], (preferences?.units.DISTANCE ?? unit) as LengthUnit) : 'Unavailable'}</strong></p>
    <p>Max. velocity: <strong data-testid="preview-velocity">{quantity(flight.summary[1], preferredUnit(preferences, 'VELOCITY', 'm/s'))}</strong></p>
    <p>Max. acceleration: <strong data-testid="preview-acceleration">{quantity(flight.acceleration, preferredUnit(preferences, 'ACCELERATION', 'm/s²'))}</strong></p>
    <p className="muted" data-testid="preview-flight-status">{flight.status}{flight.simulation && ` · ${flight.simulation}`}</p>
  </div>;
}
