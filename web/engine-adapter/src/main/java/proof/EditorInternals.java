package proof;

import info.openrocket.core.rocketcomponent.*;

/** Native dimensions and instance positions for the bounded axial side view. */
public final class EditorInternals {
    private EditorInternals() { }
    public static String snapshot(FlightConfiguration configuration) {
        StringBuilder out = new StringBuilder("[");
        for (var component : configuration.getActiveComponents()) {
            for (var position : component.getComponentLocations()) {
                double x = position.getX(), y = position.getY();
                if (component instanceof RingComponent ring) {
                    rectangle(out, component, "tube", x, y, ring.getLength(), ring.getOuterRadius(), ring.getInnerRadius());
                } else if (component instanceof MassObject pack) {
                    String kind = pack instanceof Parachute ? "parachute" : pack instanceof ShockCord ? "cord" : pack instanceof Streamer ? "streamer" : "mass";
                    // Mass-object side shapes apply this offset separately from instance locations.
                    rectangle(out, component, kind, x, y + pack.getRadialPosition() * Math.cos(pack.getRadialDirection()), pack.getLength(), pack.getRadius(), 0);
                }
                if (component instanceof Transition shell) {
                    rectangle(out, component, "shoulder", x - shell.getForeShoulderLength(), y, shell.getForeShoulderLength(), shell.getForeShoulderRadius(), 0);
                    rectangle(out, component, "shoulder", x + shell.getLength(), y, shell.getAftShoulderLength(), shell.getAftShoulderRadius(), 0);
                }
                if (component instanceof MotorMount mount && mount.isMotorMount()) {
                    var motor = mount.getMotorConfig(configuration.getFlightConfigurationID()).getMotor();
                    if (motor != null) rectangle(out, component, "motor", x + mount.getMotorPosition(configuration.getFlightConfigurationID()).getX(), y, motor.getLength(), motor.getDiameter() / 2, 0);
                }
            }
        }
        return out.append(']').toString();
    }
    private static void rectangle(StringBuilder out, RocketComponent component, String kind, double x, double y, double length, double radius, double innerRadius) {
        if (!(length > 0 && radius > 0) || !Double.isFinite(x + y + length + radius + innerRadius)) return;
        if (out.length() > 1) out.append(',');
        out.append("{\"id\":").append(ImportedFlight.quote(component.getID().toString()))
            .append(",\"kind\":").append(ImportedFlight.quote(kind))
            .append(",\"x\":").append(x).append(",\"y\":").append(y)
            .append(",\"length\":").append(length).append(",\"radius\":").append(radius)
            .append(",\"innerRadius\":").append(innerRadius).append('}');
    }
}
