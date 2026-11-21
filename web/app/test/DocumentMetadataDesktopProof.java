import java.io.File;
import java.nio.file.*;
import info.openrocket.core.document.OpenRocketDocumentFactory;
import info.openrocket.core.file.*;
import info.openrocket.core.motor.*;
import info.openrocket.core.preset.*;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.simulation.montecarlo.*;
import info.openrocket.core.startup.Application;
import proof.*;

/** Desktop-loaded physical state with registered parachute presets and saved analysis metadata. */
public class DocumentMetadataDesktopProof {
    static ComponentPreset preset() throws Exception {
        var fields = FlightPresetCatalog.properties();
        fields.put(ComponentPreset.MANUFACTURER, Manufacturer.getManufacturer("Document metadata fixture"));
        fields.put(ComponentPreset.PARTNO, "saved-physical-state");
        fields.put(ComponentPreset.MASS, .031);
        fields.put(ComponentPreset.CD, .72);
        return ComponentPresetFactory.create(fields);
    }
    public static void main(String[] args) throws Exception {
        ImportedEffectsDesktopProof.setup();
        var preset = preset();Application.getComponentPresetDao().insert(preset);
        var database = (info.openrocket.core.database.motor.ThrustCurveMotorSetDatabase) Application.getInjector().getInstance(info.openrocket.core.database.motor.MotorDatabase.class);
        for (var motor : info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase.readDatabase(new File("core/src/main/resources/datafiles/thrustcurves/initial_motors.db"))) database.addMotor(motor);
        var document = new GeneralRocketLoader(new File(args[1])).load();
        var rocket = document.getRocket();
        if (args[0].equals("generate")) {
            document.getDocumentPreferences().putString("simulation.table.hiddenColumns", "simulationStepper,optimumCoastTime,flightTime");
            document.getSimulation(0).setLandingDispersionSettings(MonteCarloSettings.builder().runCount(500).seed(1742)
                .uncertainty(MonteCarloParameter.WIND_SPEED, new UncertaintySpec(MonteCarloDistribution.NORMAL, 2.2)).build());
            int parachutes = 0, nozzles = 0;
            for (var component : rocket) {
                if (component instanceof Parachute chute) {
                    chute.setIgnorePresetClearing(true);chute.loadPreset(preset, false);
                    chute.setName("Saved parachute " + ++parachutes);chute.setDiameter(.41);chute.setLineCount(7);
                    chute.setLineLength(.47);chute.setCD(.83);chute.setOverrideMass(.043);
                    chute.setIgnorePresetClearing(false);
                }
                if (component instanceof MotorMount mount && mount.isMotorMount()) for (var id : rocket.getIds()) {
                    var config = mount.getMotorConfig(id);
                    if (config.getMotor() != null) { config.setNozzleExitDiameter(config.getMotor().getDiameter() * .4);nozzles++; }
                }
            }
            if (parachutes == 0 || nozzles == 0) throw new AssertionError("Fixture needs parachutes and motors");
            new GeneralRocketSaver().save(new File(args[2]), document, ArchiveDesktopProof.options());return;
        }
        var model = new ImportedRocketFlight(Files.readString(Path.of(args[2])));
        rocket.setSelectedConfiguration(model.selected);
        String snapshot = EditorStability.snapshot(rocket.getSelectedConfiguration());
        if (args[0].equals("registered")) {
            if (document.getDocumentPreferences().getString("simulation.table.hiddenColumns", "").isEmpty() || document.getSimulation(0).getLandingDispersionSettings() == null) throw new AssertionError("Desktop metadata was not loaded");
            for (var component : rocket) if (component instanceof Parachute chute) {
                if (chute.getPresetComponent() == null || !chute.getPresetComponent().getDigest().equals(preset.getDigest()) || chute.getOverrideMass() != .043 || chute.getCD() != .83 || chute.getDiameter() != .41) throw new AssertionError("Saved values did not override a real loaded preset");
            }
        }
        for (var component : rocket) if (component instanceof Parachute || component instanceof RailButton) component.clearPreset();
        if (!snapshot.equals(EditorStability.snapshot(rocket.getSelectedConfiguration()))) throw new AssertionError("Removing library references changed physical state");
        String expected = RailButtonPresetDesktopProof.rocketXml(document), actual = RailButtonPresetDesktopProof.rocketXml(OpenRocketDocumentFactory.createDocumentFromRocket(model.rocket));
        Files.writeString(Path.of(args[3] + "-desktop.xml"), expected);Files.writeString(Path.of(args[3] + "-reconstructed.xml"), actual);
        if (!expected.equals(actual)) throw new AssertionError("Complete physical serialization differs");
        Files.writeString(Path.of(args[3] + "-preview.json"), snapshot);
    }
}
