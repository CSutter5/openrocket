package proof;

import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.aerodynamics.barrowman.*;

/** Closed-world equivalent of Reflection.construct for current built-in Barrowman calculators. */
public final class CalculatorRegistry {
    public static Object construct(String pack, RocketComponent component, String suffix, Object... params) {
        if (!"info.openrocket.core.aerodynamics.barrowman".equals(pack) || !"Calc".equals(suffix)
                || params.length != 1 || params[0] != component) throw new IllegalArgumentException("unsupported registry invocation");
        if (component instanceof TubeFinSet) return new TubeFinSetCalc(component);
        if (component instanceof RailButton) return new RailButtonCalc(component);
        if (component instanceof LaunchLug) return new LaunchLugCalc(component);
        if (component instanceof FinSet) return new FinSetCalc((FinSet) component);
        if (component instanceof SymmetricComponent) return new SymmetricComponentCalc((SymmetricComponent) component);
        if (component instanceof ComponentAssembly) return new ComponentAssemblyCalc(component);
        throw new IllegalArgumentException("unsupported aerodynamic component");
    }
}
