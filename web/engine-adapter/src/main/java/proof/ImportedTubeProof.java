package proof;

import info.openrocket.core.material.Material;
import info.openrocket.core.rocketcomponent.BodyTube;

/**
 * Request-local scalar projection of an imported, explicitly sized BodyTube.
 * Mass and CG are intrinsic component properties, excluding document overrides.
 * XML, IDs, presets, neighboring components and configuration listeners are not
 * reconstructed by this facade; the archive adapter owns their preservation.
 */
public final class ImportedTubeProof {
    private ImportedTubeProof() { }

    public static String radiusEdit(double length, double radius, double thickness,
                                    boolean filled, double density, double value) {
        requireRange("length", length, 0, 100, false);
        requireRange("radius", radius, 0, 1, false);
        requireRange("thickness", thickness, 0, radius, true);
        requireRange("density", density, 0, 50000, false);
        requireRange("value", value, 0, 1, false);
        if (filled && thickness != radius) {
            throw new IllegalArgumentException("filled source thickness must equal its radius projection");
        }

        // Match the current saver/loader setter order. In particular, imported
        // numeric thickness is not clamped against the constructor's radius.
        BodyTube tube = new BodyTube();
        tube.setMaterial(Material.newMaterial(Material.Type.BULK, "Imported proof bulk", density, false));
        tube.setLength(length);
        if (filled) tube.setFilled(true);
        else tube.setThickness(thickness, false);
        tube.setOuterRadius(radius);

        String before = snapshot(tube);
        tube.setOuterRadius(value);
        return "{\"before\":" + before + ",\"after\":" + snapshot(tube) + "}";
    }

    private static void requireRange(String name, double value, double minimum,
                                     double maximum, boolean includeMinimum) {
        if (!Double.isFinite(value) || value > maximum
                || (includeMinimum ? value < minimum : value <= minimum)) {
            throw new IllegalArgumentException(name + " outside imported-tube proof bounds");
        }
    }

    private static String snapshot(BodyTube tube) {
        return "{\"radius\":" + tube.getOuterRadius()
            + ",\"thickness\":" + tube.getThickness()
            + ",\"automatic\":" + tube.isOuterRadiusAutomatic()
            + ",\"preset\":" + (tube.getPresetComponent() != null)
            + ",\"mass\":" + tube.getComponentMass()
            + ",\"cg\":" + tube.getComponentCG().getX() + "}";
    }

    /** Run with the original core class directory before any adapted-core directory. */
    public static void main(String[] args) {
        if (args.length != 6 || (!"true".equals(args[3]) && !"false".equals(args[3]))) {
            throw new IllegalArgumentException("expected: length radius thickness filled density newRadius");
        }
        System.out.println(radiusEdit(Double.parseDouble(args[0]), Double.parseDouble(args[1]),
            Double.parseDouble(args[2]), Boolean.parseBoolean(args[3]), Double.parseDouble(args[4]),
            Double.parseDouble(args[5])));
    }
}
