package info.openrocket.core.file.motor;
import java.util.List;
/** Access only the pinned loader's curve normalization; no numerical port. */
public final class BrowserCurve {
    public static void normalize(List<Double> time,List<Double> force,List<Double> mass,List<Double> cg) {
        AbstractMotorLoader.sortLists(time,force,mass,cg);
        AbstractMotorLoader.finalizeThrustCurve(time,force,mass,cg);
    }
}
