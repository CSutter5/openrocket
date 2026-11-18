package proof;

import info.openrocket.core.material.Material;
import info.openrocket.core.rocketcomponent.BodyTube;

/**
 * Request-local scalar projection of an imported, explicitly sized BodyTube.
 * Mass and CG are intrinsic component properties, excluding document overrides.
 * The optional preset path attaches one digest-checked catalog record. XML, IDs,
 * neighboring components and configuration listeners remain with the archive adapter.
 */
public final class ImportedTubeProof {
    private ImportedTubeProof() { }

    public static String radiusEdit(double length, double radius, double thickness,
                                    boolean filled, double density, double value) {
        validate(length, radius, thickness, filled, density, value);

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

    public static String presetRadiusEdit(String key, String digest, double length, double radius,
                                           double thickness, boolean filled, double density, double value) {
        validate(length, radius, thickness, filled, density, value);
        var preset = info.openrocket.core.preset.ProofPresetCatalog.preset(key);
        if (!preset.getDigest().equals(digest)) throw new IllegalArgumentException("Preset digest mismatch");
        BodyTube tube = new BodyTube();
        tube.setIgnorePresetClearing(true);
        tube.loadPreset(preset);
        tube.setMaterial(Material.newMaterial(Material.Type.BULK, "Imported proof bulk", density, false));
        tube.setLength(length);
        if (filled) tube.setFilled(true);
        else tube.setThickness(thickness, false);
        tube.setOuterRadius(radius);
        tube.setIgnorePresetClearing(false);
        String before = presetSnapshot(tube);
        tube.setOuterRadius(value);
        return "{\"before\":" + before + ",\"after\":" + presetSnapshot(tube) + "}";
    }

    public static String presetSnapshot(BodyTube tube) {
        String state = snapshot(tube);
        var preset = tube.getPresetComponent();
        return state.substring(0, state.length() - 1)
            + ",\"presetDigest\":" + (preset == null ? "null" : "\"" + preset.getDigest() + "\"")
            + ",\"length\":" + tube.getLength() + ",\"density\":" + tube.getMaterial().getDensity()
            + ",\"filled\":" + tube.isFilled() + ",\"innerRadius\":" + tube.getInnerRadius()
            + ",\"volume\":" + tube.getComponentVolume()
            + ",\"listeners\":" + tube.getConfigListeners().size()
            + "}";
    }

    private static void validate(double length, double radius, double thickness,
                                 boolean filled, double density, double value) {
        requireRange("length", length, 0, 100, false);
        requireRange("radius", radius, 0, 1, false);
        requireRange("thickness", thickness, 0, radius, true);
        requireRange("density", density, 0, 50000, false);
        requireRange("value", value, 0, 1, false);
        if (filled && thickness != radius) {
            throw new IllegalArgumentException("filled source thickness must equal its radius projection");
        }

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
