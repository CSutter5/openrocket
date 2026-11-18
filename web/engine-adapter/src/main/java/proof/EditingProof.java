package proof;

import java.util.HashMap;
import java.util.Map;
import info.openrocket.core.material.Material;
import info.openrocket.core.rocketcomponent.AxialStage;
import info.openrocket.core.rocketcomponent.BodyTube;
import info.openrocket.core.rocketcomponent.Rocket;
import info.openrocket.core.rocketcomponent.RocketComponent;
import org.teavm.jso.JSExport;

/** Bounded in-memory feasibility reducer. Persistence and sessions are a separate proof. */
public final class EditingProof {
    private static final Map<String, Project> projects = new HashMap<>();
    private static final class Project {
        final Rocket rocket = new Rocket();
        final AxialStage stage = new AxialStage();
        final AxialStage stage2 = new AxialStage();
        final BodyTube tube = new BodyTube(0.30, 0.02, 0.015);
        final BodyTube listener = new BodyTube(0.10, 0.02, 0.015);
        final BodyTube automatic = new BodyTube();
        final Map<String, String> acknowledgments = new HashMap<>();
        final Map<String, String> requests = new HashMap<>();
        int sequence;
        Project() {
            rocket.addChild(stage);
            rocket.addChild(stage2);
            stage.addChild(tube);
            stage.addChild(automatic);
            tube.setMaterial(Material.newMaterial(Material.Type.BULK, "Fixture bulk", 680, false));
            tube.setOuterRadiusAutomatic(true);
            tube.addConfigListener(listener);
            RocketComponent[] components = {rocket, stage, stage2, tube, listener, automatic};
            for (int i=0;i<components.length;i++) {
                components[i].setID("1000000" + i + "-0000-4000-8000-000000000000");
                components[i].setName("component-" + i);
            }
            rocket.enableEvents();
        }
    }
    @JSExport
    public static void reset() { projects.clear(); }
    private static Project project(String id) {
        if (!"project-a".equals(id) && !"project-b".equals(id)) throw new IllegalArgumentException("unknown project");
        Project result = projects.get(id);
        if (result == null) { result = new Project(); projects.put(id, result); }
        return result;
    }
    @JSExport
    public static String state(String projectId) { return snapshot(project(projectId)); }
    @JSExport
    public static String command(String projectId, String operationId, int sequence, String action,
                                 double expectedRadius, double value) {
        if (operationId == null || operationId.isEmpty() || operationId.length() > 64 || sequence < 0) throw new IllegalArgumentException("invalid operation identity");
        Project p = project(projectId);
        String existing = p.acknowledgments.get(operationId);
        String request = sequence + ":" + action + ":" + expectedRadius + ":" + value;
        if (existing != null) {
            if (!request.equals(p.requests.get(operationId))) throw new IllegalArgumentException("operation ID reused");
            return existing;
        }
        if (p.acknowledgments.size() >= 32) throw new IllegalArgumentException("proof operation bound exceeded");
        if (sequence != p.sequence) throw new IllegalArgumentException("sequence conflict");
        if (!Double.isFinite(value) || !Double.isFinite(expectedRadius)) throw new IllegalArgumentException("nonfinite value");
        if (p.tube.getOuterRadius() != expectedRadius) throw new IllegalArgumentException("field conflict");
        if ("radius".equals(action)) {
            if (value < 0 || value > 1) throw new IllegalArgumentException("radius outside proof bounds");
            p.tube.setOuterRadius(value);
        } else if ("move".equals(action)) {
            if (value != 0 && value != 1) throw new IllegalArgumentException("invalid move target");
            AxialStage parent = value == 0 ? p.stage : p.stage2;
            if (!parent.isCompatible(p.automatic)) throw new IllegalArgumentException("incompatible parent");
            p.automatic.getParent().removeChild(p.automatic);
            parent.addChild(p.automatic);
        } else if ("cycle".equals(action)) {
            // Delegate the graph rule to current desktop code; no client snapshot is accepted.
            p.tube.addChild(p.rocket);
            throw new AssertionError("core accepted invalid graph");
        } else if ("invalid-parent".equals(action)) {
            p.tube.addChild(new AxialStage());
            throw new AssertionError("core accepted invalid parent");
        } else throw new IllegalArgumentException("unsupported command");
        p.sequence++;
        String result = snapshot(p);
        p.acknowledgments.put(operationId, result);
        p.requests.put(operationId, request);
        return result;
    }
    public static String transcript() {
        reset();
        String before = state("project-a"), otherBefore = state("project-b");
        String after = command("project-a", "one", 0, "radius", 0.025, 0.005);
        if (!after.equals(command("project-a", "one", 0, "radius", 0.025, 0.005))) throw new IllegalStateException("deduplication");
        String cycle = rejection("project-a", "cycle", 1, "cycle", 0.005, 0);
        String parent = rejection("project-a", "parent", 1, "invalid-parent", 0.005, 0);
        String stale = rejection("project-a", "stale", 0, "radius", 0.005, 0.004);
        String reused = rejection("project-a", "one", 0, "radius", 0.025, 0.004);
        if (!otherBefore.equals(state("project-b"))) throw new IllegalStateException("cross-project leak");
        String moved = command("project-a", "move", 1, "move", 0.005, 1);
        String otherAfter = command("project-b", "two", 0, "radius", 0.025, 0.01);
        if (!moved.equals(state("project-a"))) throw new IllegalStateException("reverse cross-project leak");
        return "{\"before\":" + before + ",\"after\":" + after + ",\"moved\":" + moved
            + ",\"otherBefore\":" + otherBefore + ",\"otherAfter\":" + otherAfter
            + ",\"cycle\":\"" + cycle + "\",\"parent\":\"" + parent + "\",\"stale\":\"" + stale
            + "\",\"reused\":\"" + reused + "\"}";
    }
    private static String rejection(String project, String id, int sequence, String action, double expected, double value) {
        try { command(project,id,sequence,action,expected,value); }
        catch (IllegalArgumentException | IllegalStateException expectedFailure) { return "rejected"; }
        throw new IllegalStateException("invalid command accepted: " + action);
    }
    private static String tube(BodyTube t) {
        return "{\"identity\":\"" + t.getDebugName() + "\",\"parent\":\"" + (t.getParent() == null ? "none" : t.getParent().getDebugName()) + "\",\"length\":" + t.getLength() + ",\"radius\":" + t.getOuterRadius()
            + ",\"innerRadius\":" + t.getInnerRadius() + ",\"thickness\":" + t.getThickness() + ",\"automatic\":" + t.isOuterRadiusAutomatic()
            + ",\"preset\":" + (t.getPresetComponent() != null) + ",\"mass\":" + t.getComponentMass()
            + ",\"cg\":" + t.getComponentCG().getX() + ",\"density\":" + t.getMaterial().getDensity() + ",\"listeners\":" + t.getConfigListeners().size() + ",\"bypassEvents\":" + t.isBypassComponentChangeEvent() + "}";
    }
    private static String snapshot(Project p) {
        return "{\"sequence\":" + p.sequence + ",\"stageCount\":" + p.rocket.getStageCount()
            + ",\"childCount\":" + p.stage.getChildCount() + ",\"secondStageChildCount\":" + p.stage2.getChildCount() + ",\"activeStages\":" + p.rocket.getSelectedConfiguration().getActiveStages().size() + ",\"tube\":" + tube(p.tube)
            + ",\"listener\":" + tube(p.listener) + ",\"automatic\":" + tube(p.automatic) + "}";
    }
}
