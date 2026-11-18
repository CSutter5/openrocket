package proof;

import info.openrocket.core.models.atmosphere.ExtendedISAModel;
import info.openrocket.core.models.atmosphere.AtmosphericConditions;
import info.openrocket.core.models.wind.PinkNoiseWindModel;
import info.openrocket.core.util.CoordinateIF;
import org.teavm.jso.JSExport;

/** A deliberately bounded entry point into the pinned desktop algorithms. */
public final class EngineProof {
    public static void main(String[] args) throws Exception {
        System.out.println(calculations()); System.out.println(editing());
        System.out.println(flight(false)); System.out.println(flight(true));
    }
    @JSExport
    public static String flight(boolean rk6) throws Exception { return FlightProof.run(rk6); }
    @JSExport
    public static void reset() { EditingProof.reset(); }
    @JSExport
    public static String state(String id) { return EditingProof.state(id); }
    @JSExport
    public static String command(String projectId, String operationId, int sequence, String action, double expectedRadius, double value) {
        return EditingProof.command(projectId,operationId,sequence,action,expectedRadius,value);
    }
    @JSExport
    public static String editing() {
        return EditingProof.transcript();
    }
    @JSExport
    public static String calculations() {
        StringBuilder out = new StringBuilder("{\"atmosphere\":[");
        ExtendedISAModel atmosphere = new ExtendedISAModel();
        double[] altitudes = {0, 1000, 11000, 20000};
        for (int i = 0; i < altitudes.length; i++) {
            if (i > 0) out.append(',');
            AtmosphericConditions a = atmosphere.getConditions(altitudes[i]);
            out.append('[').append(a.getTemperature()).append(',').append(a.getPressure())
                .append(',').append(a.getDensity()).append(',').append(a.getMachSpeed()).append(']');
        }
        out.append("],\"wind\":[");
        PinkNoiseWindModel wind = new PinkNoiseWindModel(8447);
        wind.setAverage(3.0);
        wind.setStandardDeviation(0.3);
        for (int i = 0; i < 20; i++) {
            if (i > 0) out.append(',');
            CoordinateIF v = wind.getWindVelocity(i * 0.25, 100);
            out.append('[').append(v.getX()).append(',').append(v.getY()).append(',').append(v.getZ()).append(']');
        }
        return out.append("]}").toString();
    }
}
