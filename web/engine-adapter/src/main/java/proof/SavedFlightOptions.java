package proof;

import java.util.Map;
import info.openrocket.core.document.Simulation;
import info.openrocket.core.simulation.SimulationConditions;
import info.openrocket.core.simulation.SimulationOptions;
import info.openrocket.core.simulation.SimulationStepperMethod;
import info.openrocket.core.util.GeodeticComputationStrategy;

/** Reconstruct validated saved options through the pinned desktop setters. */
public final class SavedFlightOptions {
    public static SimulationConditions conditions(Map<String,String> fields, Simulation simulation) {
        SimulationOptions o = simulation.getOptions();
        o.setLaunchRodLength(number(fields,"launchrodlength"));
        o.setLaunchIntoWind(Boolean.parseBoolean(text(fields,"launchintowind")));
        o.setLaunchRodAngle(Math.toRadians(number(fields,"launchrodangle")));
        o.setLaunchRodDirection(Math.toRadians(number(fields,"launchroddirection")));
        o.setLaunchAltitude(number(fields,"launchaltitude"));
        o.setLaunchLatitude(number(fields,"launchlatitude"));
        o.setLaunchLongitude(number(fields,"launchlongitude"));
        o.setGeodeticComputation(GeodeticComputationStrategy.valueOf(text(fields,"geodeticmethod").toUpperCase()));
        o.setRandomSeed((int)number(fields,"randomseed")); o.setRandomSeedFixed(true);
        o.getAverageWindModel().setAverage(number(fields,"wind/speed"));
        o.getAverageWindModel().setDirection(number(fields,"wind/direction"));
        o.getAverageWindModel().setStandardDeviation(number(fields,"wind/standarddeviation"));
        o.setISAAtmosphere(text(fields,"atmosphere").equals("isa"));
        if (!o.isISAAtmosphere()) {
            o.setLaunchTemperature(number(fields,"basetemperature"));
            o.setLaunchPressure(number(fields,"basepressure"));
            o.setLaunchRelativeHumidity(number(fields,"baserelativehumidity"));
        }
        o.setGravityModelType(info.openrocket.core.models.gravity.GravityModelType.WGS);
        o.setTimeStep(number(fields,"timestep"));o.setMaxSimulationTime(number(fields,"maxtime"));
        o.setSimulationStepperMethodChoice(SimulationStepperMethod.valueOf(text(fields,"simulationsteppermethod").toUpperCase()));
        if(fields.containsKey("run/recoveryspeedwarning"))o.setRecoverySpeedWarning(number(fields,"recoveryspeedwarning"));
        if(fields.containsKey("run/drogueLowspeedwarning"))o.setDrogueLowSpeedWarning(number(fields,"drogueLowspeedwarning"));
        if(fields.containsKey("run/recoverydroguemainhighspeedwarning"))o.setRecoveryDrogueMainHighSpeedWarning(number(fields,"recoverydroguemainhighspeedwarning"));
        if(fields.containsKey("run/recoverydroguemainlowspeedwarning"))o.setRecoveryDrogueMainLowSpeedWarning(number(fields,"recoverydroguemainlowspeedwarning"));
        SimulationConditions c=o.toSimulationConditions();c.setSimulation(simulation);return c;
    }
    private static String text(Map<String,String> fields,String name) {
        String value=fields.get("run/"+name);if(value==null)throw new IllegalArgumentException("Missing saved "+name);return value;
    }
    private static double number(Map<String,String> fields,String name) {
        double value=Double.parseDouble(text(fields,name));if(!Double.isFinite(value))throw new IllegalArgumentException("Invalid saved "+name);return value;
    }
}
