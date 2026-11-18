package proof;

import info.openrocket.core.material.Material;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.rocketcomponent.position.AxialMethod;
import info.openrocket.core.util.ModID;

/** Bounded imported CenteringRing, optionally reading one explicit sibling InnerTube. */
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
        if (ring.isInnerRadiusAutomatic()) state = state.substring(0, state.length() - 1) + ",\"sibling\":" + siblingSnapshot(tube, ring) + "}";
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
        return radiusEdit(key, digest, length, radius, thickness, filled, density, ringLength, ringInner, ringDensity,
            offset, configurations, value, false, 0, 0, 0, 0, 0, 0);
    }

    public static String siblingRadiusEdit(String key, String digest, double length, double radius, double thickness,
            boolean filled, double density, double ringLength, double ringDensity, double offset, String configurations, double value,
            double siblingLength, double siblingRadius, double siblingThickness, double siblingDensity, double siblingOffset, double precedingNoseLength) {
        return radiusEdit(key, digest, length, radius, thickness, filled, density, ringLength, 0, ringDensity, offset,
            configurations, value, true, siblingLength, siblingRadius, siblingThickness, siblingDensity, siblingOffset, precedingNoseLength);
    }

    static String siblingSnapshot(BodyTube tube, CenteringRing ring) {
        InnerTube sibling = null;
        for (var child : tube.getChildren()) if (child instanceof InnerTube inner) {
            if (sibling != null) throw new IllegalArgumentException("Multiple InnerTube siblings");
            sibling = inner;
        }
        if (sibling == null) throw new IllegalArgumentException("InnerTube sibling required");
        var bounds = sibling.getInstanceBoundingBox();
        return "{\"parentLocationX\":" + tube.getComponentLocations()[0].getX() + ",\"length\":" + sibling.getLength() + ",\"outerRadius\":" + sibling.getOuterRadius()
            + ",\"innerRadius\":" + sibling.getInnerRadius() + ",\"thickness\":" + sibling.getThickness()
            + ",\"density\":" + sibling.getMaterial().getDensity() + ",\"mass\":" + sibling.getComponentMass()
            + ",\"cg\":" + sibling.getComponentCG().getX() + ",\"cgMass\":" + sibling.getComponentCG().getWeight()
            + ",\"longitudinalUnitInertia\":" + sibling.getLongitudinalUnitInertia()
            + ",\"rotationalUnitInertia\":" + sibling.getRotationalUnitInertia()
            + ",\"outerAutomatic\":" + sibling.isOuterRadiusAutomatic() + ",\"innerAutomatic\":" + sibling.isInnerRadiusAutomatic()
            + ",\"axialMethod\":\"" + sibling.getAxialMethod().name() + "\",\"axialOffset\":" + sibling.getAxialOffset()
            + ",\"positionX\":" + sibling.getPosition().getX() + ",\"radialPosition\":" + sibling.getRadialPosition()
            + ",\"radialDirection\":" + sibling.getRadialDirection() + ",\"instanceCount\":" + sibling.getInstanceCount()
            + ",\"clusterConfiguration\":\"" + sibling.getClusterConfiguration().getXMLName() + "\",\"clusterScale\":" + sibling.getClusterScale()
            + ",\"clusterRotation\":" + sibling.getClusterRotation() + ",\"preset\":" + (sibling.getPresetComponent() != null)
            + ",\"listeners\":" + sibling.getConfigListeners().size()
            + ",\"relativeStart\":" + ring.toRelative(info.openrocket.core.util.Coordinate.NUL, sibling)[0].getX()
            + ",\"relativeEnd\":" + ring.toRelative(new info.openrocket.core.util.Coordinate(ring.getLength()), sibling)[0].getX()
            + ",\"bounds\":[" + bounds.min.getX() + "," + bounds.max.getX() + "," + bounds.min.getY() + "," + bounds.max.getY()
            + "," + bounds.min.getZ() + "," + bounds.max.getZ() + "]}";
    }

    private static String radiusEdit(String key, String digest, double length, double radius, double thickness,
            boolean filled, double density, double ringLength, double ringInner, double ringDensity, double offset,
            String configurations, double value, boolean automaticInner, double siblingLength, double siblingRadius,
            double siblingThickness, double siblingDensity, double siblingOffset, double precedingNoseLength) {
        BodyTube tube = ImportedTubeProof.importedTube(key, digest, length, radius, thickness, filled, density);
        if (automaticInner) {
            if (!Double.isFinite(precedingNoseLength) || precedingNoseLength <= 0 || precedingNoseLength > 100
                    || !Double.isFinite(siblingLength) || siblingLength <= 0 || siblingLength > length
                    || !Double.isFinite(siblingRadius) || siblingRadius <= 0 || siblingRadius > 1
                    || !Double.isFinite(siblingThickness) || siblingThickness < 0 || siblingThickness > siblingRadius
                    || !Double.isFinite(siblingDensity) || siblingDensity <= 0 || siblingDensity > 50000
                    || !Double.isFinite(siblingOffset) || siblingOffset < 0 || siblingOffset + siblingLength > length)
                throw new IllegalArgumentException("Sibling outside proof bounds");
            InnerTube sibling = new InnerTube(); tube.addChild(sibling);
            sibling.setLength(siblingLength); sibling.setOuterRadius(siblingRadius); sibling.setThickness(siblingThickness);
            sibling.setMaterial(Material.newMaterial(Material.Type.BULK, "Imported sibling bulk", siblingDensity, false));
            sibling.setAxialMethod(AxialMethod.TOP); sibling.setAxialOffset(siblingOffset);
        }
        if (!Double.isFinite(value) || value <= 0 || value > 1 || !Double.isFinite(ringLength) || ringLength <= 0 || ringLength > length
                || !Double.isFinite(ringInner) || ringInner < 0 || ringInner > tube.getInnerRadius()
                || !Double.isFinite(ringDensity) || ringDensity <= 0 || ringDensity > 50000
                || !Double.isFinite(offset) || offset < 0 || offset + ringLength > length) {
            throw new IllegalArgumentException("Automatic ring inputs outside proof bounds");
        }
        Rocket rocket = new Rocket(); AxialStage stage = new AxialStage(); rocket.addChild(stage);
        if (automaticInner) { NoseCone nose = new NoseCone(); nose.setLength(precedingNoseLength); stage.addChild(nose); }
        stage.addChild(tube);
        CenteringRing ring = new CenteringRing(); tube.addChild(ring);
        ring.setLength(ringLength); ring.setMaterial(Material.newMaterial(Material.Type.BULK, "Imported ring bulk", ringDensity, false));
        ring.setInnerRadius(ringInner); ring.setInnerRadiusAutomatic(automaticInner); ring.setOuterRadiusAutomatic(true);
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
        if (!before.equals(snapshot(tube))) throw new IllegalStateException("Unstable primed geometry reads");
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
