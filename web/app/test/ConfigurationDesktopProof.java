import java.io.*;
import java.nio.file.*;
import java.util.*;
import info.openrocket.core.document.*;
import info.openrocket.core.file.*;
import info.openrocket.core.motor.*;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.simulation.*;
import info.openrocket.core.startup.Application;

/** Compare configuration edits with the native document/configuration lifecycle. */
public class ConfigurationDesktopProof {
    public static void main(String[] args) throws Exception {
        ImportedEffectsDesktopProof.setup();
        var database=(info.openrocket.core.database.motor.ThrustCurveMotorSetDatabase)Application.getInjector().getInstance(info.openrocket.core.database.motor.MotorDatabase.class);
        var motors=info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase.readDatabase(new File("core/src/main/resources/datafiles/thrustcurves/initial_motors.db"));
        for(var m:motors)database.addMotor(m);
        var before=new GeneralRocketLoader(new File(args[1])).load();var after=new GeneralRocketLoader(new File(args[2])).load();
        var rocket=before.getRocket();var id=new FlightConfigurationId(args[3]);
        if(args[0].equals("create")) {
            var old=rocket.getSelectedConfiguration().getFlightConfigurationID();boolean empty=rocket.getIds().isEmpty();
            rocket.createFlightConfiguration(id);rocket.getFlightConfiguration(id).setName(args[4]);
            var mount=(MotorMount)rocket.findComponent(UUID.fromString(args[5]));var motor=motors.stream().filter(m->m.getDigest().equals(args[6])).findFirst().orElseThrow();
            var config=new MotorConfiguration(mount,id);config.setMotor(motor);config.setEjectionDelay(args[7].equals("none")?Double.POSITIVE_INFINITY:Double.parseDouble(args[7]));mount.setMotorConfig(config,id);
            var simulation=new Simulation(before,rocket);simulation.setFlightConfigurationId(id);simulation.setName(args[8]);
            var o=simulation.getOptions();o.setLaunchRodLength(1);o.setLaunchIntoWind(false);o.setLaunchRodAngle(0);o.setLaunchRodDirection(Math.PI/2);
            o.setLaunchAltitude(0);o.setLaunchLatitude(28.61);o.setLaunchLongitude(-80.6);o.setISAAtmosphere(true);
            o.getAverageWindModel().setAverage(1);o.getAverageWindModel().setStandardDeviation(.1);o.getAverageWindModel().setDirection(Math.PI/2);
            o.setTimeStep(.05);o.setMaxSimulationTime(600);o.setRandomSeed(42);o.setRandomSeedFixed(true);o.setSimulationStepperMethodChoice(SimulationStepperMethod.RK4);
            before.addSimulation(simulation);rocket.setSelectedConfiguration(empty?id:old);
        } else if(args[0].equals("rename"))rocket.getFlightConfiguration(id).setName(args[4]);
        else if(args[0].equals("delete")) {
            boolean selected=rocket.getSelectedConfiguration().getFlightConfigurationID().equals(id);
            before.removeFlightConfigurationAndSimulations(id);
            if(selected&&!rocket.getIds().isEmpty())rocket.setSelectedConfiguration(rocket.getIds().get(0));
        } else throw new IllegalArgumentException("Unknown action");
        String expected=new String(ArchiveDesktopProof.semanticXml(before),java.nio.charset.StandardCharsets.UTF_8);
        String actual=new String(ArchiveDesktopProof.semanticXml(after),java.nio.charset.StandardCharsets.UTF_8);
        Files.writeString(Path.of(args[9]+"-expected.xml"),expected);Files.writeString(Path.of(args[9]+"-actual.xml"),actual);
        if(!expected.equals(actual))throw new AssertionError("Native configuration/document serialization differs: "+args[0]);
        new GeneralRocketSaver().save(new File(args[9]+"-resaved.ork"),after,ArchiveDesktopProof.options());
        System.out.println("Native configuration "+args[0]+" and full document serialization match");
    }
}
