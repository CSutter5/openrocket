package proof;

import java.util.*;
import info.openrocket.core.aerodynamics.*;
import info.openrocket.core.document.Simulation;
import info.openrocket.core.logging.WarningSet;
import info.openrocket.core.masscalc.*;
import info.openrocket.core.material.Material;
import info.openrocket.core.material.MaterialGroup;
import info.openrocket.core.models.atmosphere.ExtendedISAModel;
import info.openrocket.core.models.gravity.WGSGravityModel;
import info.openrocket.core.models.wind.PinkNoiseWindModel;
import info.openrocket.core.motor.*;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.simulation.*;
import info.openrocket.core.util.*;

import info.openrocket.core.rocketcomponent.position.*;

/** Complete, deliberately narrow archive model; separate from the drawing/reducer. */
public final class ImportedFlight {
    private static final String S="rocket/subcomponents/stage", N=S+"/subcomponents/nosecone", B=S+"/subcomponents/bodytube",
        F=B+"/subcomponents/trapezoidfinset", M=B+"/subcomponents/innertube", P=B+"/subcomponents/parachute";
    private final Map<String,String> fields = new LinkedHashMap<>();
    public ImportedFlight(String input) {
        if (input.length()>65536) throw new IllegalArgumentException("Flight input too large");
        for (String row:input.split("\n")) {
            int tab=row.indexOf('\t'); if(tab<1) throw new IllegalArgumentException("Invalid flight field");
            if(fields.put(row.substring(0,tab),unescape(row.substring(tab+1)))!=null) throw new IllegalArgumentException("Duplicate flight field");
        }
    }
    private static String unescape(String value) {
        StringBuilder out=new StringBuilder();
        for(int i=0;i<value.length();i++) {
            char c=value.charAt(i);
            if(c=='\\') { c=value.charAt(++i); c=switch(c) {case 't' -> '\t'; case 'n' -> '\n'; case 'r' -> '\r'; default -> c;}; }
            out.append(c);
        }
        return out.toString();
    }
    private String text(String key) { String v=fields.get(key); if(v==null) throw new IllegalArgumentException("Missing "+key); return v; }
    private double number(String key) { double v=Double.parseDouble(text(key)); if(!Double.isFinite(v)||Math.abs(v)>1e12) throw new IllegalArgumentException("Invalid "+key); return v; }
    private Material material(String path) {
        MaterialGroup group=switch(text(path+"/@group")) { case "Other" -> MaterialGroup.OTHER; case "PaperProducts" -> MaterialGroup.PAPER; default -> throw new IllegalArgumentException("Unsupported material group"); };
        double shear=fields.containsKey(path+"/@shearModulus") ? number(path+"/@shearModulus") : 0;
        return Material.newMaterial(Material.Type.valueOf(text(path+"/@type").toUpperCase()),text(path),number(path+"/@density"),shear,group,!path.endsWith("/filletmaterial"));
    }
    private void identity(RocketComponent c,String path) { c.setID(text(path+"/id")); c.setName(text(path+"/name")); }
    private void position(RocketComponent c,String path) {
        c.setAxialMethod(AxialMethod.valueOf(text(path+"/axialoffset/@method").toUpperCase())); c.setAxialOffset(number(path+"/axialoffset"));
    }
    public Rocket rocket() {
        Rocket rocket=new Rocket(); AxialStage stage=new AxialStage(); rocket.addChild(stage);
        NoseCone nose=new NoseCone(); stage.addChild(nose);
        nose.setLength(number(N+"/length")); nose.setShapeType(Transition.Shape.valueOf(text(N+"/shape").toUpperCase())); nose.setShapeParameter(number(N+"/shapeparameter"));
        nose.setAftRadius(number(N+"/aftradius")); nose.setAftRadiusAutomatic(false); nose.setThickness(number(N+"/thickness"));
        nose.setAftShoulderRadius(number(N+"/aftshoulderradius")); nose.setAftShoulderLength(number(N+"/aftshoulderlength")); nose.setAftShoulderThickness(number(N+"/aftshoulderthickness")); nose.setAftShoulderCapped(Boolean.parseBoolean(text(N+"/aftshouldercapped")));
        nose.setMaterial(material(N+"/material")); nose.setFinish(ExternalComponent.Finish.valueOf(text(N+"/finish").toUpperCase()));
        BodyTube body=new BodyTube(); stage.addChild(body);
        body.setLength(number(B+"/length")); body.setOuterRadius(number(B+"/radius")); body.setOuterRadiusAutomatic(false); body.setThickness(number(B+"/thickness"));
        body.setMaterial(material(B+"/material")); body.setFinish(ExternalComponent.Finish.valueOf(text(B+"/finish").toUpperCase()));
        TrapezoidFinSet fins=new TrapezoidFinSet(); body.addChild(fins);
        fins.setFinShape(number(F+"/rootchord"),number(F+"/tipchord"),number(F+"/sweeplength"),number(F+"/height"),number(F+"/thickness"));
        fins.setFinCount((int)number(F+"/fincount")); fins.setBaseRotation(number(F+"/rotation")); position(fins,F);
        fins.setCantAngle(number(F+"/cant")); fins.setCrossSection(FinSet.CrossSection.valueOf(text(F+"/crosssection").toUpperCase()));
        fins.setRadius(RadiusMethod.valueOf(text(F+"/radiusoffset/@method").toUpperCase()),number(F+"/radiusoffset")); fins.setAngleOffset(number(F+"/angleoffset"));
        fins.setFilletRadius(number(F+"/filletradius")); fins.setFilletMaterial(material(F+"/filletmaterial")); fins.setMaterial(material(F+"/material")); fins.setFinish(ExternalComponent.Finish.valueOf(text(F+"/finish").toUpperCase()));
        InnerTube mount=new InnerTube(); body.addChild(mount); position(mount,M);
        mount.setLength(number(M+"/length")); mount.setOuterRadius(number(M+"/outerradius")); mount.setThickness(number(M+"/thickness")); mount.setMaterial(material(M+"/material"));
        mount.setClusterConfiguration(ClusterConfiguration.SINGLE); mount.setClusterScale(number(M+"/clusterscale")); mount.setClusterRotation(number(M+"/clusterrotation"));
        Parachute chute=new Parachute(); body.addChild(chute); position(chute,P);
        chute.setLength(number(P+"/packedlength")); chute.setRadius(number(P+"/packedradius")); chute.setRadialPosition(number(P+"/radialposition")); chute.setRadialDirection(number(P+"/radialdirection"));
        chute.setDiameter(number(P+"/diameter")); chute.setCDAutomatic(true); chute.setMaterial(material(P+"/material")); chute.setLineCount((int)number(P+"/linecount")); chute.setLineLengthAutomatic(true); chute.setLineMaterial(material(P+"/linematerial"));
        DeploymentConfiguration deploy=chute.getDeploymentConfigurations().getDefault(); deploy.setDeployEvent(DeploymentConfiguration.DeployEvent.valueOf(text(P+"/deployevent").toUpperCase())); deploy.setDeployAltitude(number(P+"/deployaltitude")); deploy.setDeployDelay(number(P+"/deploydelay"));
        identity(rocket,"rocket"); identity(stage,S); identity(nose,N); identity(body,B); identity(fins,F); identity(mount,M); identity(chute,P);
        rocket.enableEvents(); position(rocket,"rocket");
        FlightConfigurationId id=new FlightConfigurationId(text("rocket/motorconfiguration/@configid")); rocket.createFlightConfiguration(id); rocket.setSelectedConfiguration(id);
        mount.setMotorMount(true); mount.setMotorOverhang(number(M+"/motormount/overhang"));
        MotorConfiguration mc=new MotorConfiguration(mount,id); mc.setMotor(motor()); mc.setEjectionDelay(number(M+"/motormount/motor/delay"));
        mc.setIgnitionEvent(IgnitionEvent.valueOf(text(M+"/motormount/ignitionconfiguration/ignitionevent").toUpperCase())); mc.setIgnitionDelay(number(M+"/motormount/ignitionconfiguration/ignitiondelay")); mount.setMotorConfig(mc,id);
        return rocket;
    }
    public ThrustCurveMotor motor() {
        double[] times=new double[8],thrust=new double[8]; CoordinateIF[] cg=new CoordinateIF[8];
        for(int i=0;i<8;i++) { String[] row=text("motor/"+i).split(","); times[i]=Double.parseDouble(row[0]); thrust[i]=Double.parseDouble(row[1]); cg[i]=new Coordinate(Double.parseDouble(row[3]),0,0,Double.parseDouble(row[2])); }
        String path=M+"/motormount/motor";
        ThrustCurveMotor motor=new ThrustCurveMotor.Builder().setManufacturer(Manufacturer.getManufacturer(text(path+"/manufacturer"))).setDesignation(text(path+"/designation")).setCommonName(text(path+"/designation"))
            .setMotorType(Motor.Type.SINGLE).setStandardDelays(new double[]{3,5,7}).setDiameter(number(path+"/diameter")).setLength(number(path+"/length")).setTimePoints(times).setThrustPoints(thrust).setCGPoints(cg).setDigest(text(path+"/digest")).build();
        if(!MotorDigest.digestMotor(motor).equals(motor.getDigest())) throw new IllegalArgumentException("Motor functional digest mismatch");
        return motor;
    }
    public static String run(String input, boolean rk6) throws Exception {
        ImportedFlight model=new ImportedFlight(input); Rocket rocket=model.rocket();
        Simulation simulation=new Simulation(rocket);
        simulation.setFlightConfigurationId(rocket.getSelectedConfiguration().getFlightConfigurationID());
        return simulate(rocket,model.motor(),simulation,rk6);
    }
    public static String simulate(Rocket rocket, ThrustCurveMotor motor, Simulation simulation, boolean rk6) throws Exception {
        return simulate(rocket,motor,simulation,rk6,120);
    }
    public static String simulate(Rocket rocket, ThrustCurveMotor motor, Simulation simulation, boolean rk6, double maxTime) throws Exception {
        simulation.getOptions().setSimulationStepperMethodChoice(rk6 ? SimulationStepperMethod.RK6 : SimulationStepperMethod.RK4);
        SimulationConditions conditions = new SimulationConditions(); conditions.setSimulation(simulation);
        conditions.setLaunchRodLength(1); conditions.setLaunchRodAngle(0); conditions.setLaunchRodDirection(Math.PI/2);
        conditions.setLaunchSite(new WorldCoordinate(28.61,-80.60,0));
        conditions.setGeodeticComputation(GeodeticComputationStrategy.SPHERICAL);
        conditions.setAtmosphericModel(new ExtendedISAModel()); conditions.setGravityModel(new WGSGravityModel());
        PinkNoiseWindModel wind = new PinkNoiseWindModel(42); wind.setAverage(1); wind.setStandardDeviation(0.1);
        conditions.setWindModel(wind); conditions.setAerodynamicCalculator(new BarrowmanCalculator());
        conditions.setMassCalculator(new MassCalculator()); conditions.setTimeStep(0.05);
        conditions.setMaxSimulationTime(maxTime); conditions.setRandomSeed(42);
        return simulate(rocket,motor,simulation,rk6,conditions);
    }
    public static String simulate(Rocket rocket, ThrustCurveMotor motor, Simulation simulation, boolean rk6, SimulationConditions conditions) throws Exception {
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
            out.append('[').append(EditorStability.scalar(time.get(i))).append(',').append(EditorStability.scalar(altitude.get(i))).append(',').append(EditorStability.scalar(velocity.get(i))).append(',').append(EditorStability.scalar(acceleration.get(i))).append(']');
        }
        out.append("],\"warningCount\":").append(data.getWarningSet().size()).append('}');
        String base = out.toString();
        return base.substring(0, base.length()-1) + ",\"branches\":" + branches(data) + ",\"warnings\":" + warnings(data) + ",\"inputs\":" + inputs(rocket, motor) + "}";
    }
    private static String branches(FlightData data) {
        StringBuilder out=new StringBuilder("[");
        for(int index=0;index<data.getBranchCount();index++) {
            if(index>0)out.append(',');FlightDataBranch branch=data.getBranch(index);
            out.append("{\"name\":").append(quote(branch.getName())).append(",\"events\":[");boolean first=true;
            for(var event:branch.getEvents()) {
                if(!first)out.append(',');first=false;
                out.append('[').append(quote(event.getType().name())).append(',').append(event.getTime()).append(',')
                    .append(event.getSource()==null?"null":quote(event.getSource().getID().toString())).append(']');
            }
            out.append("],\"series\":[");
            var time=branch.get(FlightDataType.TYPE_TIME);var altitude=branch.get(FlightDataType.TYPE_ALTITUDE);
            var velocity=branch.get(FlightDataType.TYPE_VELOCITY_TOTAL);var acceleration=branch.get(FlightDataType.TYPE_ACCELERATION_TOTAL);
            for(int i=0;i<time.size();i++) {
                if(i>0)out.append(',');out.append('[').append(EditorStability.scalar(time.get(i))).append(',')
                    .append(EditorStability.scalar(altitude.get(i))).append(',').append(EditorStability.scalar(velocity.get(i))).append(',')
                    .append(EditorStability.scalar(acceleration.get(i))).append(']');
            }
            out.append("],\"channels\":{");
            var types=branch.getTypes();
            for(int t=0;t<types.length;t++) {
                if(t>0)out.append(',');
                out.append(quote(types[t].getSaveKey())).append(":[");
                var values=branch.get(types[t]);
                for(int i=0;i<values.size();i++) {
                    if(i>0)out.append(',');out.append(EditorStability.scalar(values.get(i)));
                }
                out.append(']');
            }
            out.append("}}");
        }
        return out.append(']').toString();
    }
    public static String quote(String value) {
        return "\""+value.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r").replace("\t","\\t")+"\"";
    }
    private static String warnings(FlightData data) {
        StringBuilder out=new StringBuilder("["); boolean first=true;
        for(var warning:data.getWarningSet()) { if(!first)out.append(','); first=false; out.append(quote(warning.toString())); }
        return out.append(']').toString();
    }
    /** Same serializer applied to the independently desktop-loaded model by the oracle. */
    public static String inputs(Rocket rocket, ThrustCurveMotor motor) {
        StringBuilder out=new StringBuilder("{\"components\":["); boolean first=true;
        for(RocketComponent c:rocket) {
            if(!first)out.append(','); first=false;
            out.append("{\"id\":").append(quote(c.getID().toString())).append(",\"type\":").append(quote(c.getClass().getSimpleName()))
                .append(",\"mass\":").append(c.getComponentMass()).append(",\"cg\":").append(c.getComponentCG().getX()).append(",\"length\":").append(c.getLength())
                .append(",\"position\":[").append(c.getPosition().getX()).append(',').append(c.getPosition().getY()).append(',').append(c.getPosition().getZ()).append(']')
                .append(",\"massOverride\":").append(c.isMassOverridden()).append(",\"cgOverride\":").append(c.isCGOverridden()).append(",\"cdOverride\":").append(c.isCDOverridden());
            if(c instanceof ExternalComponent e) out.append(",\"density\":").append(e.getMaterial().getDensity()).append(",\"finish\":").append(quote(e.getFinish().name()));
            if(c instanceof BodyTube t) out.append(",\"radius\":").append(t.getOuterRadius()).append(",\"thickness\":").append(t.getThickness());
            if(c instanceof InnerTube t) out.append(",\"radius\":").append(t.getOuterRadius()).append(",\"thickness\":").append(t.getThickness()).append(",\"density\":").append(t.getMaterial().getDensity());
            if(c instanceof Parachute p) out.append(",\"cd\":").append(p.getCD()).append(",\"lineLength\":").append(p.getLineLength()).append(",\"canopyDensity\":").append(p.getMaterial().getDensity()).append(",\"lineDensity\":").append(p.getLineMaterial().getDensity());
            out.append('}');
        }
        out.append("],\"motorDigest\":").append(quote(MotorDigest.digestMotor(motor))).append(",\"curve\":[");
        double[] time=motor.getTimePoints(),thrust=motor.getThrustPoints(); CoordinateIF[] cg=motor.getCGPoints();
        for(int i=0;i<time.length;i++) { if(i>0)out.append(','); out.append('[').append(time[i]).append(',').append(thrust[i]).append(',').append(cg[i].getWeight()).append(',').append(cg[i].getX()).append(']'); }
        return out.append("]}").toString();
    }
}
