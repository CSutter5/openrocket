import java.io.File;
import java.nio.file.*;
import java.util.*;
import com.google.gson.*;
import info.openrocket.core.document.*;
import info.openrocket.core.file.*;
import info.openrocket.core.file.openrocket.OpenRocketSaverTest;
import info.openrocket.core.preset.*;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.startup.Application;
import info.openrocket.core.util.ModID;
import proof.ImportedDeploymentProof;
import proof.ImportedTubeProof;
import proof.ImportedRingProof;

/** Independent actual-document oracle and desktop-valid fixture generator; development JVM only. */
public class ImportedEffectsDesktopProof {
    static final Gson GSON = new GsonBuilder().serializeNulls().setPrettyPrinting().create();
    static void setup() throws Exception {
        OpenRocketSaverTest.setup();
        for (String key : List.of("G1-A", "G1-B")) {
            ComponentPreset preset = ComponentPresetFactory.create(ProofPresetCatalog.properties(key));
            ArchiveDesktopProof.require(preset.getDigest().equals(ProofPresetCatalog.preset(key).getDigest()), "Catalog bridge differs from validated factory");
            Application.getComponentPresetDao().insert(preset);
        }
    }
    static RecoveryDevice recovery(OpenRocketDocument doc) {
        for (var c : doc.getRocket()) if (c instanceof Parachute p) return p;
        throw new AssertionError("Fixture requires a parachute");
    }
    static BodyTube tube(OpenRocketDocument doc) {
        for (var c : doc.getRocket()) if (c instanceof BodyTube t) return t;
        throw new AssertionError("Fixture requires a body tube");
    }
    static void generate(String source, Path output, boolean automaticRing) throws Exception {
        List<Object> catalog = new ArrayList<>();
        for (String key : List.of("G1-A", "G1-B")) {
            var preset = ProofPresetCatalog.preset(key);
            catalog.add(Map.of("key", key, "type", preset.getType().name(), "manufacturer", preset.getManufacturer().getSimpleName(),
                "partno", preset.getPartNo(), "digest", preset.getDigest()));
            var doc = new GeneralRocketLoader(new File(source)).load();
            var target = tube(doc); target.loadPreset(preset);
            // Default fixtures keep geometry explicit. The optional mode below
            // selects exactly one supported automatic dependency.
            for (var component : doc.getRocket()) if (component instanceof RingComponent ring) {
                double outer = ring.getOuterRadius(), inner = ring.getInnerRadius();
                ring.setOuterRadius(outer); ring.setInnerRadius(inner);
                if (ring instanceof CenteringRing centering) centering.setInnerRadiusAutomatic(false);
            }
            if (automaticRing) {
                CenteringRing selected = null;
                for (var child : target.getChildren()) if (child instanceof CenteringRing ring) { selected = ring; break; }
                ArchiveDesktopProof.require(selected != null, "Fixture requires a centering ring");
                selected.setLength(key.equals("G1-A") ? 0.004 : 0.006);
                selected.setMaterial(info.openrocket.core.material.Material.newMaterial(info.openrocket.core.material.Material.Type.BULK,
                    "G1 ring bulk", key.equals("G1-A") ? 500 : 750, false));
                selected.setInnerRadius(key.equals("G1-A") ? 0.006 : 0.01); selected.setInnerRadiusAutomatic(false);
                selected.setAxialMethod(info.openrocket.core.rocketcomponent.position.AxialMethod.TOP);
                selected.setAxialOffset(key.equals("G1-A") ? 0.02 : 0.04); selected.setOuterRadiusAutomatic(true);
            }
            // A no-op reset, a real override, and remaining inherited configurations.
            var device = recovery(doc); var set = device.getDeploymentConfigurations();
            set.setDefault(ImportedDeploymentProof.configuration("APOGEE", key.equals("G1-A") ? 200 : 300, 0));
            var ids = doc.getRocket().getIds().toArray(new FlightConfigurationId[0]);
            ArchiveDesktopProof.require(ids.length >= 3, "Need three configurations");
            set.set(ids[0], ImportedDeploymentProof.configuration("ALTITUDE", key.equals("G1-A") ? 120 : 180, 1.5));
            set.set(ids[1], set.getDefault().clone());
            var script = new info.openrocket.core.simulation.extension.impl.ScriptingExtension();
            script.setScript("throw new Error('G1_IMPORTED_SCRIPT_EXECUTED');");
            script.setEnabled(true);
            doc.getSimulations().get(0).getSimulationExtensions().add(script);
            // Historical results are deliberately retained; no simulation is run.
            new GeneralRocketSaver().save(output.resolve(key + ".ork").toFile(), doc, ArchiveDesktopProof.options());
        }
        Files.writeString(output.resolve("catalog.json"), GSON.toJson(catalog) + "\n");
    }
    static List<String> statuses(OpenRocketDocument d) {
        return d.getSimulations().stream().map(s -> s.getStatus().name().toLowerCase(Locale.ROOT)).toList();
    }
    static Object json(String text) { return JsonParser.parseString(text); }
    static String snapshot(OpenRocketDocument doc, String type, RocketComponent target) {
        if (type.equals("setOuterRadius")) return automaticRing((BodyTube) target) ? ImportedRingProof.snapshot((BodyTube) target) : ImportedTubeProof.presetSnapshot((BodyTube) target);
        return ImportedDeploymentProof.snapshot((RecoveryDevice) target, doc.getRocket().getIds().toArray(new FlightConfigurationId[0]));
    }
    static boolean automaticRing(BodyTube tube) {
        return tube.getChildren().stream().anyMatch(c -> c instanceof CenteringRing r && r.isOuterRadiusAutomatic());
    }
    static void probeUnderfit(String input, Path reportPath) throws Exception {
        var doc = new GeneralRocketLoader(new File(input)).load();
        BodyTube tube = tube(doc); CenteringRing ring = ImportedRingProof.ring(tube);
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("before", json(ImportedRingProof.snapshot(tube)));
        tube.setOuterRadius(0.0005);
        report.put("live", json(ImportedRingProof.snapshot(tube)));
        var output = reportPath.getParent(); Files.createDirectories(output);
        Files.write(output.resolve("expected.xml"), ArchiveDesktopProof.semanticXml(doc));
        var saved = output.resolve("underfit.ork"); new GeneralRocketSaver().save(saved.toFile(), doc, ArchiveDesktopProof.options());
        var reloaded = new GeneralRocketLoader(saved.toFile()).load();
        var actual = (CenteringRing) reloaded.getRocket().findComponent(ring.getID());
        report.put("reloaded", Map.of("outerRadius", actual.getOuterRadius(), "innerRadius", actual.getInnerRadius(),
            "outerAutomatic", actual.isOuterRadiusAutomatic(), "mass", actual.getComponentMass()));
        Files.write(output.resolve("actual.xml"), ArchiveDesktopProof.semanticXml(reloaded));
        ArchiveDesktopProof.require(ring.isOuterRadiusAutomatic() && !actual.isOuterRadiusAutomatic(), "Underfit control changed; investigate before broadening acceptance");
        report.put("outcome", "classified-rejection-required");
        report.put("reason", "Desktop reload disables automatic outer radius when the explicit ring hole exceeds the parent inner radius");
        Files.writeString(reportPath, GSON.toJson(report) + "\n");
    }
    public static void main(String[] args) throws Exception {
        setup();
        if (args[0].equals("digests")) {
            List<Integer> lengths = new ArrayList<>();
            for (int i = 0; i < 130; i++) lengths.add(i);
            lengths.addAll(List.of(255, 256, 511, 512, 513, 4096));
            for (int length : lengths) {
                byte[] bytes = new byte[length];
                for (int i = 0; i < length; i++) bytes[i] = (byte) i;
                String expected = HexFormat.of().formatHex(java.security.MessageDigest.getInstance("MD5").digest(bytes));
                ArchiveDesktopProof.require(expected.equals(proof.PortableDigest.vector(length)), "JDK/portable MD5 mismatch at " + length);
            }
            System.out.println("JDK/portable MD5: " + lengths.size() + " vectors passed");
            return;
        }
        if (args[0].equals("generate") || args[0].equals("generate-ring")) { generate(args[1], Path.of(args[2]), args[0].equals("generate-ring")); return; }
        if (args[0].equals("probe-ring-underfit")) { probeUnderfit(args[1], Path.of(args[2])); return; }
        // original edited type componentId value-or-configuration reportPath
        Path reportPath = Path.of(args[5]); Path output = reportPath.getParent(); Files.createDirectories(output);
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("inputSha256", ArchiveDesktopProof.hash(Files.readAllBytes(Path.of(args[0]))));
        report.put("editedSha256", ArchiveDesktopProof.hash(Files.readAllBytes(Path.of(args[1]))));
        try {
            var originalLoader = new GeneralRocketLoader(new File(args[0]));
            var editedLoader = new GeneralRocketLoader(new File(args[1]));
            var original = originalLoader.load(); var edited = editedLoader.load();
            var target = original.getRocket().findComponent(UUID.fromString(args[3]));
            var actual = edited.getRocket().findComponent(target.getID());
            report.put("originalWarnings", originalLoader.getWarnings().toString()); report.put("editedWarnings", editedLoader.getWarnings().toString());
            var ids = original.getRocket().getIds().toArray(new FlightConfigurationId[0]);
            ModID[] mods = Arrays.stream(ids).map(id -> original.getRocket().getFlightConfiguration(id).getModID()).toArray(ModID[]::new);
            ModID[] rocketMods = ImportedDeploymentProof.modificationIds(original.getRocket());
            report.put("statusesBefore", statuses(original));
            Map<String, Object> state = new LinkedHashMap<>();
            state.put("before", json(snapshot(original, args[2], target)));
            if (args[2].equals("setOuterRadius")) {
                var tube = (BodyTube) target;
                boolean automatic = automaticRing(tube);
                tube.setOuterRadius(Double.parseDouble(args[4]));
                if (automatic) {
                    List<Boolean> changes = new ArrayList<>();
                    for (int i = 0; i < ids.length; i++) changes.add(mods[i] != original.getRocket().getFlightConfiguration(ids[i]).getModID());
                    state.put("configurationChanged", changes);
                    state.put("rocketChanged", json(ImportedDeploymentProof.modificationChanges(original.getRocket(), rocketMods)));
                }
            }
            else {
                // Execute the desktop reset action independently of the reducer wrapper.
                var selected = new FlightConfigurationId(args[4]);
                var device = (RecoveryDevice) target;
                var old = device.getDeploymentConfigurations().get(selected).copy(selected);
                device.getDeploymentConfigurations().reset(selected);
                boolean changed = !old.equals(device.getDeploymentConfigurations().get(selected));
                if (changed) original.getRocket().fireComponentChangeEvent(ComponentChangeEvent.AERODYNAMIC_CHANGE, selected);
                state.put("functionalChange", changed);
                List<Boolean> changes = new ArrayList<>();
                for (int i = 0; i < ids.length; i++) changes.add(mods[i] != original.getRocket().getFlightConfiguration(ids[i]).getModID());
                state.put("configurationChanged", changes);
                state.put("rocketChanged", json(ImportedDeploymentProof.modificationChanges(original.getRocket(), rocketMods)));
            }
            state.put("after", json(snapshot(original, args[2], target))); report.put("state", state);
            ArchiveDesktopProof.require(json(snapshot(original, args[2], target)).equals(json(snapshot(edited, args[2], actual))), "Complete relevant state differs");
            report.put("statusesAfter", statuses(original)); report.put("editedStatuses", statuses(edited));
            byte[] expected = ArchiveDesktopProof.semanticXml(original), xml = ArchiveDesktopProof.semanticXml(edited);
            ArchiveDesktopProof.requireSameXml(expected, xml, "Full document serialization differs", output);
            ArchiveDesktopProof.requireSameMotorCurves(original, edited);
            report.put("semanticSha256", ArchiveDesktopProof.hash(xml)); report.put("counts", RadiusDesktopProof.counts(edited));
            Path saved = output.resolve("desktop-resaved.ork");
            new GeneralRocketSaver().save(saved.toFile(), edited, ArchiveDesktopProof.options());
            var reloaded = new GeneralRocketLoader(saved.toFile()).load();
            ArchiveDesktopProof.requireSameXml(xml, ArchiveDesktopProof.semanticXml(reloaded), "Desktop save/reload differs", output);
            ArchiveDesktopProof.requireSameMotorCurves(edited, reloaded);
            ArchiveDesktopProof.require(json(snapshot(edited, args[2], actual)).equals(json(snapshot(reloaded, args[2], reloaded.getRocket().findComponent(target.getID())))), "Reload state differs");
            report.put("fullSerializationEqual", true); report.put("desktopReloadEqual", true); report.put("outcome", "passed");
        } catch (Throwable e) { report.put("outcome", "failed"); report.put("error", e.toString()); throw e; }
        finally { Files.writeString(reportPath, GSON.toJson(report) + "\n"); }
    }
}
