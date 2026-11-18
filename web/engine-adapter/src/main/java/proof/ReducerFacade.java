package proof;
import org.teavm.jso.JSExport;
/** Separate entry point: simulations are not reachable from the server reducer. */
public final class ReducerFacade {
    public static void main(String[] args) { System.out.println(editing()); }
    @JSExport public static String radiusEdit(double length, double radius, double thickness, boolean filled, double density, double value) {
        return ImportedTubeProof.radiusEdit(length, radius, thickness, filled, density, value);
    }
    @JSExport public static String presetRadiusEdit(String key, String digest, double length, double radius, double thickness, boolean filled, double density, double value) {
        return ImportedTubeProof.presetRadiusEdit(key, digest, length, radius, thickness, filled, density, value);
    }
    @JSExport public static String automaticRingRadiusEdit(String key, String digest, double length, double radius, double thickness,
            boolean filled, double density, double ringLength, double ringInner, double ringDensity, double offset, String configurations, double value) {
        return ImportedRingProof.radiusEdit(key, digest, length, radius, thickness, filled, density, ringLength, ringInner, ringDensity, offset, configurations, value);
    }
    @JSExport public static String resetDeployment(String event, double altitude, double delay, String overrides, String configurations, String selected) {
        return ImportedDeploymentProof.resetDeployment(event, altitude, delay, overrides, configurations, selected);
    }
    @JSExport public static String digestVector(int length) { return PortableDigest.vector(length); }
    @JSExport public static String editing() { return EditingProof.transcript(); }
    @JSExport public static void reset() { EditingProof.reset(); }
    @JSExport public static String state(String id) { return EditingProof.state(id); }
    @JSExport public static String command(String projectId, String operationId, int sequence, String action, double expectedRadius, double value) {
        return EditingProof.command(projectId,operationId,sequence,action,expectedRadius,value);
    }
}
