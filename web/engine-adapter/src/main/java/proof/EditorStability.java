package proof;

import info.openrocket.core.aerodynamics.*;
import info.openrocket.core.masscalc.MassCalculator;
import info.openrocket.core.logging.WarningSet;
import info.openrocket.core.rocketcomponent.FlightConfiguration;
import info.openrocket.core.rocketcomponent.SymmetricComponent;
import info.openrocket.core.unit.CaliberUnit;
import info.openrocket.core.util.*;

/** Same launch CG and worst-angle CP conditions as the desktop design view. */
public final class EditorStability {
    private EditorStability() { }
    public static String calculate(String input) {
        return snapshot(new ImportedRocketFlight(input, true).rocket.getSelectedConfiguration());
    }
    public static String snapshot(FlightConfiguration configuration) {
        var conditions = new FlightConditions(configuration);
        conditions.setMach(0.3);conditions.setAOA(0);conditions.setRollRate(0);
        var cg = MassCalculator.calculateLaunch(configuration).getCM();
        var cp = new BarrowmanCalculator().getWorstCP(configuration, conditions, new WarningSet());
        double diameter = Double.NaN;
        for (var component : configuration.getCoreComponents()) if (component instanceof SymmetricComponent shell)
            diameter = MathUtil.max(diameter, shell.getForeRadius() * 2, shell.getAftRadius() * 2);
        return "{\"cg\":" + coordinate(cg, MassCalculator.MIN_MASS) + ",\"cp\":" + coordinate(cp, MathUtil.EPSILON)
            + ",\"length\":" + scalar(configuration.getLength()) + ",\"diameter\":" + scalar(diameter)
            + ",\"massWithoutMotors\":" + scalar(MassCalculator.calculateStructure(configuration).getMass())
            + ",\"massWithMotors\":" + scalar(cg.getWeight())
            + ",\"caliber\":" + scalar(CaliberUnit.calculateCaliber(configuration))
            + ",\"aerodynamicLength\":" + scalar(configuration.getLengthAerodynamic())
            + ",\"internals\":" + EditorInternals.snapshot(configuration) + "}";
    }
    public static String scalar(double value) { return Double.isFinite(value) ? Double.toString(value) : "null"; }
    private static String coordinate(CoordinateIF value, double minimum) {
        return value.getWeight() > minimum && Double.isFinite(value.getX()) ? Double.toString(value.getX()) : "null";
    }
}
