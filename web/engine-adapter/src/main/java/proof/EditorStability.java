package proof;

import info.openrocket.core.aerodynamics.*;
import info.openrocket.core.masscalc.MassCalculator;
import info.openrocket.core.logging.WarningSet;
import info.openrocket.core.rocketcomponent.FlightConfiguration;
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
        return "{\"cg\":" + coordinate(cg, MassCalculator.MIN_MASS) + ",\"cp\":" + coordinate(cp, MathUtil.EPSILON) + "}";
    }
    private static String coordinate(CoordinateIF value, double minimum) {
        return value.getWeight() > minimum && Double.isFinite(value.getX()) ? Double.toString(value.getX()) : "null";
    }
}
