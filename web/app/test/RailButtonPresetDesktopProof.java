import java.io.File;
import java.nio.file.*;
import info.openrocket.core.document.OpenRocketDocumentFactory;
import info.openrocket.core.file.*;
import info.openrocket.core.material.Material;
import info.openrocket.core.motor.*;
import info.openrocket.core.preset.*;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.simulation.SimulationStepperMethod;
import info.openrocket.core.startup.Application;
import proof.*;

/** A real registered rail-button preset, including mass and drag effects, plus native reload oracles. */
public class RailButtonPresetDesktopProof {
    static ComponentPreset preset() throws Exception {
        var fields = new TypedPropertyMap();
        fields.put(ComponentPreset.TYPE, ComponentPreset.Type.RAIL_BUTTON);
        fields.put(ComponentPreset.MANUFACTURER, Manufacturer.getManufacturer("Web rail fixture"));
        fields.put(ComponentPreset.PARTNO, "explicit-state");
        fields.put(ComponentPreset.OUTER_DIAMETER, .010);
        fields.put(ComponentPreset.INNER_DIAMETER, .006);
        fields.put(ComponentPreset.HEIGHT, .009);
        fields.put(ComponentPreset.BASE_HEIGHT, .002);
        fields.put(ComponentPreset.FLANGE_HEIGHT, .002);
        fields.put(ComponentPreset.SCREW_HEIGHT, .001);
        fields.put(ComponentPreset.MASS, .003);
        fields.put(ComponentPreset.SCREW_MASS, .0004);
        fields.put(ComponentPreset.NUT_MASS, .0002);
        fields.put(ComponentPreset.CD, .2);
        fields.put(ComponentPreset.MATERIAL, Material.newMaterial(Material.Type.BULK, "Fixture polymer", 1100, true));
        fields.put(ComponentPreset.FINISH, ExternalComponent.Finish.ROUGH);
        return ComponentPresetFactory.create(fields);
    }
    static String rocketXml(info.openrocket.core.document.OpenRocketDocument document) throws Exception {
        String xml = new String(ArchiveDesktopProof.semanticXml(document), java.nio.charset.StandardCharsets.UTF_8);
        xml = xml.substring(xml.indexOf("<rocket>"), xml.indexOf("</rocket>"))
            .replaceAll("(?s)\\s*<appearance>.*?</appearance>", "");
        // Configuration maps can serialize in different iteration orders; compare every keyed value.
        var groups = java.util.regex.Pattern.compile("(?s)(?:\\s*<deploymentconfiguration configid=\"[^\"]+\">.*?</deploymentconfiguration>)+").matcher(xml);
        return groups.replaceAll(group -> {
            var entries = java.util.regex.Pattern.compile("(?s)<deploymentconfiguration configid=\"[^\"]+\">.*?</deploymentconfiguration>").matcher(group.group()).results()
                .map(java.util.regex.MatchResult::group).sorted().toList();
            return java.util.regex.Matcher.quoteReplacement("\n" + String.join("\n", entries));
        });
    }
    public static void main(String[] args) throws Exception {
        ImportedEffectsDesktopProof.setup();
        var preset = preset();Application.getComponentPresetDao().insert(preset);
        var database = (info.openrocket.core.database.motor.ThrustCurveMotorSetDatabase) Application.getInjector().getInstance(info.openrocket.core.database.motor.MotorDatabase.class);
        for (var motor : info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase.readDatabase(new File("core/src/main/resources/datafiles/thrustcurves/initial_motors.db"))) database.addMotor(motor);
        var document = new GeneralRocketLoader(new File(args[1])).load();
        var rocket = document.getRocket();
        if (args[0].equals("generate")) {
            int count = 0;
            for (var component : rocket) if (component instanceof RailButton button) {
                button.setIgnorePresetClearing(true);button.loadPreset(preset);
                button.setName("Explicit rail-button fixture");button.setOuterDiameter(.011);
                button.setOverrideMass(.0045);button.setOverrideCD(.37);button.setFinish(ExternalComponent.Finish.SMOOTH);
                button.setIgnorePresetClearing(false);count++;
            }
            if (count == 0) throw new AssertionError("Fixture needs a rail button");
            new GeneralRocketSaver().save(new File(args[2]), document, ArchiveDesktopProof.options());return;
        }
        var model = new ImportedRocketFlight(Files.readString(Path.of(args[2])));
        rocket.setSelectedConfiguration(model.selected);
        String snapshot = EditorStability.snapshot(rocket.getSelectedConfiguration());
        if (args[0].equals("user-model")) {
            String expected = rocketXml(document), actual = rocketXml(OpenRocketDocumentFactory.createDocumentFromRocket(model.rocket));
            Files.writeString(Path.of(args[3] + "-desktop.xml"), expected);Files.writeString(Path.of(args[3] + "-reconstructed.xml"), actual);
            if (!expected.equals(actual)) throw new AssertionError("Full user rocket physical serialization differs");
            Files.writeString(Path.of(args[3] + "-preview.json"), snapshot);return;
        }
        boolean attached = false;
        for (var component : rocket) if (component instanceof RailButton button) {
            if (button.getPresetComponent() == null || !button.getPresetComponent().getDigest().equals(preset.getDigest())) throw new AssertionError("Reference did not load the registered preset");
            if (!button.isMassOverridden() || button.getOverrideMass() != .0045 || !button.isCDOverridden() || button.getOverrideCD() != .37 || button.getOuterDiameter() != .011) throw new AssertionError("Explicit fields did not override the loaded preset");
            button.clearPreset();attached = true;
        }
        if (!attached || !snapshot.equals(EditorStability.snapshot(rocket.getSelectedConfiguration()))) throw new AssertionError("Removing only the library link changed physical state");
        String expected = rocketXml(document), actual = rocketXml(OpenRocketDocumentFactory.createDocumentFromRocket(model.rocket));
        Files.writeString(Path.of(args[3] + "-desktop.xml"), expected);Files.writeString(Path.of(args[3] + "-reconstructed.xml"), actual);
        if (!expected.equals(actual)) throw new AssertionError("Full physical serialization differs");
        Files.writeString(Path.of(args[3] + "-preview.json"), snapshot);
        var simulation = document.getSimulation(0);
        if (!simulation.getOptions().isRandomSeedFixed()) simulation.getOptions().setRandomSeed(42);
        simulation.setFlightConfigurationId(model.selected);
        var conditions = simulation.getOptions().toSimulationConditions();conditions.setSimulation(simulation);
        ThrustCurveMotor motor = null;
        for (var component : rocket) if (component instanceof MotorMount mount && mount.isMotorMount()) motor = (ThrustCurveMotor) mount.getMotorConfig(model.selected).getMotor();
        Files.writeString(Path.of(args[3] + "-flight.json"), ImportedFlight.simulate(rocket, motor, simulation, simulation.getOptions().getSimulationStepperMethodChoice() == SimulationStepperMethod.RK6, conditions));
    }
}
