package proof;
import org.teavm.jso.JSExport;
/** Separate entry point: simulations are not reachable from the server reducer. */
public final class ReducerFacade {
    public static void main(String[] args) { System.out.println(editing()); }
    @JSExport public static String editing() { return EditingProof.transcript(); }
    @JSExport public static void reset() { EditingProof.reset(); }
    @JSExport public static String state(String id) { return EditingProof.state(id); }
    @JSExport public static String command(String projectId, String operationId, int sequence, String action, double expectedRadius, double value) {
        return EditingProof.command(projectId,operationId,sequence,action,expectedRadius,value);
    }
}
