package proof;

import java.util.List;
import info.openrocket.core.aerodynamics.*;
import info.openrocket.core.document.Simulation;
import info.openrocket.core.logging.WarningSet;
import info.openrocket.core.masscalc.*;
import info.openrocket.core.material.Material;
import info.openrocket.core.models.atmosphere.ExtendedISAModel;
import info.openrocket.core.models.gravity.WGSGravityModel;
import info.openrocket.core.models.wind.PinkNoiseWindModel;
import info.openrocket.core.motor.*;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.simulation.*;
import info.openrocket.core.util.*;

/** Explicit single-stage fixture, derived from MMRocket's published C6 harness geometry. */
public final class FlightProof {
    public static String run(boolean rk6) throws Exception {
        Rocket rocket = new Rocket();
        AxialStage stage = new AxialStage();
        rocket.addChild(stage);
        NoseCone nose = new NoseCone(Transition.Shape.OGIVE, 0.07, 0.012);
        nose.setThickness(0.002);
        stage.addChild(nose);
        BodyTube body = new BodyTube(0.30, 0.012, 0.0003);
        body.setMaterial(Material.newMaterial(Material.Type.BULK, "Fixture bulk", 950, false));
        stage.addChild(body);
        TrapezoidFinSet fins = new TrapezoidFinSet(3, 0.05, 0.03, 0.02, 0.03);
        fins.setThickness(0.003);
        body.addChild(fins);
        InnerTube mount = new InnerTube();
        mount.setLength(0.07); mount.setOuterRadius(0.0095); mount.setThickness(0.0005);
        body.addChild(mount);
        Parachute chute = new Parachute(); chute.setDiameter(0.30); body.addChild(chute);
        int componentIndex = 0;
        for (RocketComponent component : rocket) {
            component.setID("2000000" + componentIndex + "-0000-4000-8000-000000000000");
            component.setName("flight-component-" + componentIndex++);
        }
        rocket.enableEvents();
        FlightConfigurationId id = new FlightConfigurationId("00000001-0001-4001-8001-000000000001");
        rocket.createFlightConfiguration(id); rocket.setSelectedConfiguration(id);
        double[] times = {0,0.1,0.3,0.5,1,1.5,1.85,2};
        double[] thrusts = {0,12,6,5.1,4.9,4.8,4.5,0};
        double[] masses = {0.0240,0.0231,0.0215,0.0202,0.0174,0.0147,0.0133,0.0132};
        CoordinateIF[] cg = new CoordinateIF[masses.length];
        for (int i=0;i<cg.length;i++) cg[i] = new Coordinate(0.035,0,0,masses[i]);
        ThrustCurveMotor motor = new ThrustCurveMotor.Builder()
            .setManufacturer(Manufacturer.getManufacturer("Estes")).setDesignation("C6 proof").setCommonName("C6 proof")
            .setMotorType(Motor.Type.SINGLE).setStandardDelays(new double[]{3,5,7})
            .setDiameter(0.018).setLength(0.070).setTimePoints(times).setThrustPoints(thrusts).setCGPoints(cg)
            .setDigest("g1-explicit-c6").build();
        mount.setMotorMount(true);
        MotorConfiguration motorConfig = new MotorConfiguration(mount,id);
        motorConfig.setMotor(motor); motorConfig.setEjectionDelay(5); mount.setMotorConfig(motorConfig,id);
        Simulation simulation = new Simulation(rocket,id);
        simulation.getOptions().setSimulationStepperMethodChoice(rk6 ? SimulationStepperMethod.RK6 : SimulationStepperMethod.RK4);
        SimulationConditions conditions = new SimulationConditions(); conditions.setSimulation(simulation);
        conditions.setLaunchRodLength(1); conditions.setLaunchRodAngle(0); conditions.setLaunchRodDirection(Math.PI/2);
        conditions.setLaunchSite(new WorldCoordinate(28.61,-80.60,0));
        conditions.setGeodeticComputation(GeodeticComputationStrategy.SPHERICAL);
        conditions.setAtmosphericModel(new ExtendedISAModel()); conditions.setGravityModel(new WGSGravityModel());
        PinkNoiseWindModel wind = new PinkNoiseWindModel(42); wind.setAverage(1); wind.setStandardDeviation(0.1);
        conditions.setWindModel(wind); conditions.setAerodynamicCalculator(new BarrowmanCalculator());
        conditions.setMassCalculator(new MassCalculator()); conditions.setTimeStep(0.05);
        conditions.setMaxSimulationTime(120); conditions.setRandomSeed(42);
        RigidBody mass = MassCalculator.calculateStructure(rocket.getSelectedConfiguration());
        CoordinateIF cp = new BarrowmanCalculator().getCP(rocket.getSelectedConfiguration(),new FlightConditions(rocket.getSelectedConfiguration()),new WarningSet());
        BasicEventSimulationEngine engine = new BasicEventSimulationEngine(); engine.simulate(conditions);
        FlightData data = engine.getFlightData(); FlightDataBranch branch = data.getBranch(0);
        StringBuilder out = new StringBuilder("{\"rk6\":").append(rk6).append(",\"mass\":").append(mass.getMass())
            .append(",\"cg\":").append(mass.getCM().getX()).append(",\"cp\":").append(cp.getX())
            .append(",\"motorImpulse\":").append(motor.getTotalImpulseEstimate())
            .append(",\"motorThrustSamples\":[").append(motor.getThrust(0.05)).append(',').append(motor.getThrust(0.2)).append(']')
            .append(",\"maxAcceleration\":").append(EditorStability.scalar(data.getMaxAcceleration()))
            .append(",\"summary\":[").append(data.getMaxAltitude()).append(',').append(data.getMaxVelocity()).append(',')
            .append(data.getTimeToApogee()).append(',').append(data.getFlightTime()).append("],\"events\":[");
        boolean first = true;
        for (FlightEvent event : branch.getEvents()) {
            if (!first) out.append(','); first=false;
            out.append("[\"").append(event.getType().name()).append("\",").append(event.getTime()).append(']');
        }
        out.append("],\"series\":[");
        List<Double> time = branch.get(FlightDataType.TYPE_TIME);
        List<Double> altitude = branch.get(FlightDataType.TYPE_ALTITUDE);
        List<Double> velocity = branch.get(FlightDataType.TYPE_VELOCITY_TOTAL);
        List<Double> acceleration = branch.get(FlightDataType.TYPE_ACCELERATION_TOTAL);
        for (int i=0;i<time.size();i++) {
            if (i>0) out.append(',');
            out.append('[').append(time.get(i)).append(',').append(altitude.get(i)).append(',').append(velocity.get(i)).append(',').append(acceleration.get(i)).append(']');
        }
        out.append("],\"warningCount\":").append(data.getWarningSet().size()).append('}');
        return out.toString();
    }
}
