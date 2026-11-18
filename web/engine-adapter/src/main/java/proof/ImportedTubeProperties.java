package proof;
import info.openrocket.core.rocketcomponent.BodyTube;
import info.openrocket.core.rocketcomponent.Rocket;
import info.openrocket.core.rocketcomponent.AxialStage;

/** Additional request-local BodyTube setters; automatic dependency graphs stay with the radius proof. */
public final class ImportedTubeProperties {
    private ImportedTubeProperties() { }
    public static String edit(String key, String digest, double length, double radius, double thickness,
            boolean filled, double density, String property, double value) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException("Expected a finite property value");
        BodyTube tube = ImportedTubeProof.importedTube(key, digest, length, radius, thickness, filled, density);
        Rocket rocket = new Rocket(); AxialStage stage = new AxialStage(); rocket.addChild(stage); stage.addChild(tube); rocket.enableEvents();
        var modification = rocket.getFunctionalModID();
        String before = ImportedTubeProof.presetSnapshot(tube);
        switch (property) {
            case "length":
                if (value <= 0 || value > 100) throw new IllegalArgumentException("Length must be in (0, 100] m");
                tube.setLength(value); break;
            case "thickness":
                if (value < 0 || value > 1) throw new IllegalArgumentException("Wall thickness must be in [0, 1] m");
                tube.setThickness(value); break;
            default: throw new IllegalArgumentException("Unsupported tube property");
        }
        return "{\"before\":" + before + ",\"after\":" + ImportedTubeProof.presetSnapshot(tube) + ",\"functionalChange\":" + (modification != rocket.getFunctionalModID()) + "}";
    }
}
