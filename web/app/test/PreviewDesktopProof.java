import java.io.File;
import java.nio.file.*;
import info.openrocket.core.file.*;
import info.openrocket.core.rocketcomponent.*;
import proof.EditorStability;

/** Loaded desktop model oracle plus explicit off-axis internal geometry. */
public class PreviewDesktopProof {
    public static void main(String[] args) throws Exception {
        ImportedEffectsDesktopProof.setup();
        var database = (info.openrocket.core.database.motor.ThrustCurveMotorSetDatabase) info.openrocket.core.startup.Application.getInjector().getInstance(info.openrocket.core.database.motor.MotorDatabase.class);
        for (var motor : info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase.readDatabase(new File("core/src/main/resources/datafiles/thrustcurves/initial_motors.db"))) database.addMotor(motor);
        var document = new GeneralRocketLoader(new File(args[1])).load();
        if (args[0].equals("generate")) {
            BodyTube body = null;
            for (var component : document.getRocket()) {
                if (component instanceof BodyTube tube) body = tube;
                if (component instanceof NoseCone nose) { nose.setAftShoulderLength(.015); nose.setAftShoulderRadius(.008); }
                if (component instanceof InnerTube tube) { tube.setRadialPosition(.003); tube.setRadialDirection(0); }
            }
            var ballast = new MassComponent(); body.addChild(ballast); ballast.setName("Offset ballast");
            ballast.setLength(.023); ballast.setRadius(.004); ballast.setComponentMass(.012);
            ballast.setRadialPosition(.006); ballast.setRadialDirection(0);
            var coupler = new TubeCoupler(); body.addChild(coupler); coupler.setName("Preview coupler"); coupler.setLength(.035);
            var block = new EngineBlock(); body.addChild(block); block.setName("Preview engine block"); block.setLength(.005);
            var ring = new CenteringRing(); body.addChild(ring); ring.setName("Preview ring"); ring.setLength(.003);
            var cap = new Bulkhead(); body.addChild(cap); cap.setName("Preview bulkhead"); cap.setLength(.002);
            var streamer = new Streamer(); body.addChild(streamer); streamer.setName("Preview streamer"); streamer.setLength(.025); streamer.setRadius(.006);
            new GeneralRocketSaver().save(new File(args[2]), document, ArchiveDesktopProof.options());
        } else if (args[0].equals("snapshot")) {
            if (!args[2].equals("default")) document.getRocket().setSelectedConfiguration(new FlightConfigurationId(args[2]));
            Files.writeString(Path.of(args[3]), EditorStability.snapshot(document.getRocket().getSelectedConfiguration()));
        } else throw new IllegalArgumentException("Unknown preview oracle action");
    }
}
