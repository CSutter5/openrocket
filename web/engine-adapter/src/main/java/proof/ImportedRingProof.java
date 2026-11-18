package proof;

import info.openrocket.core.material.Material;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.rocketcomponent.position.AxialMethod;
import info.openrocket.core.util.ModID;

/** One imported child CenteringRing with automatic outer radius and explicit inner radius. */
public final class ImportedRingProof {
    private ImportedRingProof() { }

    public static CenteringRing ring(BodyTube parent) {
        CenteringRing found = null;
        for (RocketComponent child : parent.getChildren()) {
            if (child instanceof CenteringRing ring && ring.isOuterRadiusAutomatic()) {
                if (found != null) throw new IllegalArgumentException("Multiple automatic rings");
                found = ring;
            }
        }
        if (found == null) throw new IllegalArgumentException("Automatic child ring required");
        return found;
    }

    public static String snapshot(BodyTube tube) {
        CenteringRing ring = ring(tube);
        var bounds = ring.getInstanceBoundingBox();
        var cg = ring.getComponentCG();
        String state = ImportedTubeProof.presetSnapshot(tube);
        return state.substring(0, state.length() - 1) + ",\"ring\":{\"outerRadius\":" + ring.getOuterRadius()
            + ",\"innerRadius\":" + ring.getInnerRadius() + ",\"outerAutomatic\":" + ring.isOuterRadiusAutomatic()
            + ",\"innerAutomatic\":" + ring.isInnerRadiusAutomatic() + ",\"thickness\":" + ring.getThickness()
            + ",\"length\":" + ring.getLength() + ",\"density\":" + ring.getMaterial().getDensity()
            + ",\"mass\":" + ring.getComponentMass() + ",\"cg\":" + cg.getX() + ",\"cgMass\":" + cg.getWeight()
            + ",\"longitudinalUnitInertia\":" + ring.getLongitudinalUnitInertia()
            + ",\"rotationalUnitInertia\":" + ring.getRotationalUnitInertia()
            + ",\"axialMethod\":\"" + ring.getAxialMethod().name() + "\",\"axialOffset\":" + ring.getAxialOffset()
            + ",\"positionX\":" + ring.getPosition().getX() + ",\"radialPosition\":" + ring.getRadialPosition()
            + ",\"radialDirection\":" + ring.getRadialDirection() + ",\"instanceCount\":" + ring.getInstanceCount()
            + ",\"instanceSeparation\":" + ring.getInstanceSeparation()
            + ",\"bounds\":[" + bounds.min.getX() + "," + bounds.max.getX() + "," + bounds.min.getY() + "," + bounds.max.getY()
            + "," + bounds.min.getZ() + "," + bounds.max.getZ() + "]"
            + ",\"preset\":" + (ring.getPresetComponent() != null) + ",\"listeners\":" + ring.getConfigListeners().size() + "}}";
    }

    public static String radiusEdit(String key, String digest, double length, double radius, double thickness,
                                     boolean filled, double density, double ringLength, double ringInner,
                                     double ringDensity, double offset, String configurations, double value) {
        BodyTube tube = ImportedTubeProof.importedTube(key, digest, length, radius, thickness, filled, density);
        if (!Double.isFinite(value) || value <= 0 || value > 1 || !Double.isFinite(ringLength) || ringLength <= 0 || ringLength > length
                || !Double.isFinite(ringInner) || ringInner < 0 || ringInner > tube.getInnerRadius()
                || !Double.isFinite(ringDensity) || ringDensity <= 0 || ringDensity > 50000
                || !Double.isFinite(offset) || offset < 0 || offset + ringLength > length) {
            throw new IllegalArgumentException("Automatic ring inputs outside proof bounds");
        }
        Rocket rocket = new Rocket(); AxialStage stage = new AxialStage(); rocket.addChild(stage); stage.addChild(tube);
        CenteringRing ring = new CenteringRing(); tube.addChild(ring);
        ring.setLength(ringLength); ring.setMaterial(Material.newMaterial(Material.Type.BULK, "Imported ring bulk", ringDensity, false));
        ring.setInnerRadius(ringInner); ring.setInnerRadiusAutomatic(false); ring.setOuterRadiusAutomatic(true);
        ring.setAxialMethod(AxialMethod.TOP); ring.setAxialOffset(offset);
        String[] keys = configurations.split(";");
        if (keys.length < 1 || keys.length > 16) throw new IllegalArgumentException("Configuration count outside proof bounds");
        FlightConfigurationId[] ids = new FlightConfigurationId[keys.length];
        for (int i = 0; i < ids.length; i++) {
            ids[i] = new FlightConfigurationId(keys[i]);
            if (!ids[i].isValid() || !keys[i].equals(ids[i].key.toString())) throw new IllegalArgumentException("Invalid configuration ID");
            for (int j = 0; j < i; j++) if (ids[j].equals(ids[i])) throw new IllegalArgumentException("Duplicate configuration ID");
            rocket.createFlightConfiguration(ids[i]);
        }
        rocket.enableEvents();
        // Prime the actual getters/derived geometry before applying the parent setter.
        String before = snapshot(tube);
        ModID[] rootMods = ImportedDeploymentProof.modificationIds(rocket), mods = new ModID[ids.length];
        for (int i = 0; i < ids.length; i++) mods[i] = rocket.getFlightConfiguration(ids[i]).getModID();
        tube.setOuterRadius(value);
        String after = snapshot(tube);
        if (!after.equals(snapshot(tube))) throw new IllegalStateException("Unstable derived geometry reads");
        StringBuilder changed = new StringBuilder("[");
        for (int i = 0; i < ids.length; i++) { if (i > 0) changed.append(','); changed.append(mods[i] != rocket.getFlightConfiguration(ids[i]).getModID()); }
        return "{\"before\":" + before + ",\"after\":" + after + ",\"configurationChanged\":" + changed.append(']')
            + ",\"rocketChanged\":" + ImportedDeploymentProof.modificationChanges(rocket, rootMods) + "}";
    }
}
