import java.io.*;
import java.nio.file.*;
import java.util.*;
import info.openrocket.core.document.*;
import info.openrocket.core.file.*;
import info.openrocket.core.motor.*;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.simulation.*;
import info.openrocket.core.startup.Application;
import proof.ImportedFlight;

/** Actual desktop loader/options are the independent oracle for selected browser runs. */
public class SavedSimulationDesktopProof {
    public static void main(String[] args) throws Exception {
        ImportedEffectsDesktopProof.setup();
        var database=(info.openrocket.core.database.motor.ThrustCurveMotorSetDatabase)Application.getInjector().getInstance(info.openrocket.core.database.motor.MotorDatabase.class);
        var motors=info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase.readDatabase(new File("core/src/main/resources/datafiles/thrustcurves/initial_motors.db"));
        for(var m:motors)database.addMotor(m);
        var doc=new GeneralRocketLoader(new File(args[1])).load();
        if(args[0].equals("generate") || args[0].equals("generate-simple")) {
            boolean simple=args[0].equals("generate-simple");
            while(doc.getSimulationCount()>0)doc.removeSimulation(0);
            for(int i=0;i<2;i++) {
                var sim=new Simulation(doc,doc.getRocket());sim.setName(simple?"Simple RK"+(i==0?"4":"6"):i==0?"Saved low wind":"Saved windy flight");
                sim.setFlightConfigurationId(i==0 || simple?doc.getRocket().getSelectedConfiguration().getFlightConfigurationID():new FlightConfigurationId("90000001-0000-4000-8000-000000000000"));
                var o=sim.getOptions();o.setLaunchRodLength(1.6+i*.2);o.setLaunchRodAngle(Math.toRadians(5+i));o.setLaunchRodDirection(Math.toRadians(100));o.setLaunchIntoWind(false);
                o.setLaunchLatitude(41.5);o.setLaunchLongitude(-89.5);o.setLaunchAltitude(100+i*30);o.setISAAtmosphere(true);
                o.getAverageWindModel().setAverage(1.3+i);o.getAverageWindModel().setDirection(.7);o.getAverageWindModel().setStandardDeviation(.13+i*.1);
                o.setRandomSeed(197+i);o.setRandomSeedFixed(true);o.setTimeStep(.05);o.setMaxSimulationTime(600);o.setSimulationStepperMethodChoice(i==0?SimulationStepperMethod.RK4:SimulationStepperMethod.RK6);
                if(simple) {
                    // Retain the established synthetic-profile inputs when migrating its UI proof to saved rows.
                    o.setLaunchRodLength(1);o.setLaunchRodAngle(0);o.setLaunchRodDirection(Math.PI/2);
                    o.setLaunchLatitude(28.61);o.setLaunchLongitude(-80.6);o.setLaunchAltitude(0);
                    o.getAverageWindModel().setAverage(1);o.getAverageWindModel().setDirection(Math.PI/2);o.getAverageWindModel().setStandardDeviation(.1);
                    o.setRandomSeed(42);o.setMaxSimulationTime(120);
                }
                doc.addSimulation(sim);sim.simulate();
            }
            new GeneralRocketSaver().save(new File(args[2]),doc,ArchiveDesktopProof.options());return;
        }
        if(args[0].equals("reference")) {
            var sim=doc.getSimulation(Integer.parseInt(args[2]));
            if(!sim.getOptions().isRandomSeedFixed())sim.getOptions().setRandomSeed(42);
            var id=sim.getId();doc.getRocket().setSelectedConfiguration(id);ThrustCurveMotor motor=null;
            for(var c:doc.getRocket())if(c instanceof MotorMount m&&m.isMotorMount()&&m.getMotorConfig(id).getMotor() instanceof ThrustCurveMotor assigned)motor=assigned;
            var conditions=sim.getOptions().toSimulationConditions();conditions.setSimulation(sim);
            boolean rk6=sim.getOptions().getSimulationStepperMethodChoice()==SimulationStepperMethod.RK6;
            Files.writeString(Path.of(args[3]),ImportedFlight.simulate(doc.getRocket(),motor,sim,rk6,conditions));return;
        }
        if(args[0].equals("assigned")) {
            var id=new FlightConfigurationId(args[2]);var mount=doc.getRocket().findComponent(UUID.fromString(args[3]));
            var m=((MotorMount)mount).getMotorConfig(id);
            if(m.getMotor()==null||!((ThrustCurveMotor)m.getMotor()).getDigest().equals(args[4])||!m.getMotor().getDesignation().equals(args[5]))throw new AssertionError("Desktop did not load the chosen motor");
            double delay=args[6].equals("none")?Double.POSITIVE_INFINITY:Double.parseDouble(args[6]);
            if(m.getEjectionDelay()!=delay)throw new AssertionError("Wrong ejection delay");
            new GeneralRocketSaver().save(new File(args[7]),doc,ArchiveDesktopProof.options());return;
        }
        throw new IllegalArgumentException("Unknown action");
    }
}
