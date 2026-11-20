package proof;

import java.util.*;
import java.util.ArrayList;
import info.openrocket.core.document.Simulation;
import info.openrocket.core.file.motor.BrowserCurve;
import info.openrocket.core.material.*;
import info.openrocket.core.motor.*;
import info.openrocket.core.preset.FlightPresetCatalog;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.rocketcomponent.position.*;
import info.openrocket.core.util.*;

/** Bounded imported single-stage model. Unrepresented fields fail before flight. */
public final class ImportedRocketFlight {
    final Map<String,String> fields=new LinkedHashMap<>();
    public final List<RocketComponent> components=new ArrayList<>();
    public final List<FlightConfigurationId> configurations=new ArrayList<>();
    public final Rocket rocket;
    private final boolean analysis;
    public final FlightConfigurationId selected;
    public ThrustCurveMotor selectedMotor;
    public ImportedRocketFlight(String input) { this(input, false); }
    public ImportedRocketFlight(String input, boolean analysis) {
        this.analysis = analysis;
        if(input.length()>1048576)throw new IllegalArgumentException("Simulation model exceeds limit");
        for(String line:input.split("\n")) {
            if(line.equals("imported-flight-v1"))continue;
            int tab=line.indexOf('\t');if(tab<1)throw new IllegalArgumentException("Invalid model field");
            String key=line.substring(0,tab);if(fields.put(key,decode(line.substring(tab+1)))!=null)throw new IllegalArgumentException("Duplicate model field "+key);
        }
        selected=new FlightConfigurationId(text("configuration"));
        rocket=new Rocket();rocket.setID(text("0/id"));rocket.enableEvents();components.add(rocket);
        for(String key:fields.keySet())if(key.startsWith("config/")){FlightConfigurationId id=new FlightConfigurationId(key.substring(7));configurations.add(id);rocket.createFlightConfiguration(id);if(fields.containsKey("configurationName/"+id))rocket.getFlightConfiguration(id).setName(text("configurationName/"+id));}
        int count=(int)num("count");if(count<2||count>64)throw new IllegalArgumentException("Component limit");
        for(int i=1;i<count;i++) {
            RocketComponent c=switch(text(i+"/type")) {
                case "stage"->new AxialStage();case "nosecone"->new NoseCone();case "transition"->new Transition();case "bodytube"->new BodyTube();
                case "innertube"->new InnerTube();case "trapezoidfinset"->new TrapezoidFinSet();case "parachute"->new Parachute();
                case "ellipticalfinset"->new EllipticalFinSet();case "tubefinset"->new TubeFinSet();
                case "launchlug"->new LaunchLug();case "railbutton"->new RailButton();case "streamer"->new Streamer();
                case "centeringring"->new CenteringRing();case "tubecoupler"->new TubeCoupler();case "engineblock"->new EngineBlock();
                case "masscomponent"->new MassComponent();case "bulkhead"->new Bulkhead();case "shockcord"->new ShockCord();
                default->throw new IllegalArgumentException("Unsupported component");
            };
            c.setID(text(i+"/id"));components.get((int)num(i+"/parent")).addChild(c);components.add(c);
        }
        for(int i=0;i<count;i++) {
            RocketComponent c=components.get(i);c.setIgnorePresetClearing(true);
            String prefix=i+"/";
            for(String key:fields.keySet())if(key.startsWith(prefix)) {
                String field=key.substring(prefix.length());if(field.contains("/")||field.equals("type")||field.equals("parent"))continue;
                apply(c,field,key);
            }
            c.setIgnorePresetClearing(false);
            if(c instanceof RecoveryDevice d)for(FlightConfigurationId id:configurations) {
                String p=prefix+"deploymentconfiguration/"+id+"/";
                if(fields.containsKey(p+"deployevent")){DeploymentConfiguration dc=new DeploymentConfiguration();dc.setDeployEvent(deploy(text(p+"deployevent")));dc.setDeployAltitude(num(p+"deployaltitude"));dc.setDeployDelay(num(p+"deploydelay"));d.getDeploymentConfigurations().set(id,dc);}
            }
            if(c instanceof MotorMount mount&&fields.containsKey(prefix+"motormount/overhang"))motors(mount,prefix+"motormount/");
        }
        rocket.setSelectedConfiguration(selected);
        if(!analysis && selectedMotor==null)throw new IllegalArgumentException("Selected configuration has no resolved motor");
    }
    static String decode(String value) {
        StringBuilder out=new StringBuilder();for(int i=0;i<value.length();i++){char c=value.charAt(i);if(c=='\\'){c=value.charAt(++i);c=switch(c){case 't'->'\t';case 'n'->'\n';case 'r'->'\r';default->c;};}out.append(c);}return out.toString();
    }
    String text(String key){String v=fields.get(key);if(v==null)throw new IllegalArgumentException("Missing simulation input "+key);return v;}
    double num(String key){double v=Double.parseDouble(text(key));if(!Double.isFinite(v)||Math.abs(v)>1e12)throw new IllegalArgumentException("Nonfinite/out-of-range "+key);return v;}
    boolean bool(String key){String v=text(key);if(!v.equals("true")&&!v.equals("false"))throw new IllegalArgumentException("Invalid boolean "+key);return v.equals("true");}
    boolean auto(String key){return text(key).equals("auto")||text(key).startsWith("auto ");}
    double dimension(String key){return Double.parseDouble(text(key).replace("auto ",""));}
    Material material(String key) {
        if (analysis && !fields.containsKey(key+"/@group")) {
            // Group and shear metadata do not affect launch mass or static CP.
            return Material.newMaterial(Material.Type.valueOf(text(key+"/@type").toUpperCase()),text(key),num(key+"/@density"),
                fields.containsKey(key+"/@shearModulus") ? num(key+"/@shearModulus") : 0, null, true, true);
        }
        MaterialGroup group=null;for(MaterialGroup g:MaterialGroup.ALL_GROUPS)if(g.getDatabaseString().equals(text(key+"/@group")))group=g;
        if(group==null)throw new IllegalArgumentException("Unsupported material group");
        double shear=fields.containsKey(key+"/@shearModulus")?num(key+"/@shearModulus"):0;
        String name=text(key);double density=num(key+"/@density");
        boolean stock=(name.equals("Aluminum")&&density==2700&&shear==2.6e10&&group==MaterialGroup.METALS)
            ||(name.equals("Fiberglass")&&density==1850&&shear==4.14e9&&group==MaterialGroup.COMPOSITES)
            ||(name.equals("Cardboard")&&density==680&&shear==4e8&&group==MaterialGroup.PAPER)
            ||(name.equals("Elastic cord (round 2 mm, 1/16 in)")&&density==.0018&&shear==0&&group==MaterialGroup.ELASTICS);
        return Material.newMaterial(Material.Type.valueOf(text(key+"/@type").toUpperCase()),name,num(key+"/@density"),shear,group,!stock);
    }
    static DeploymentConfiguration.DeployEvent deploy(String value){for(var e:DeploymentConfiguration.DeployEvent.values())if(e.name().replace("_","").equalsIgnoreCase(value))return e;throw new IllegalArgumentException("Unsupported deployment event "+value);}
    void apply(RocketComponent c,String field,String key) {
        String value=text(key);
        switch(field) {
            case "name":c.setName(value);break;case "id":c.setID(value);break;case "comment":c.setComment(value);break;
            case "color":case "linestyle":break; // Presentation metadata, preserved by the archive codec.
            case "designtype":((Rocket)c).setDesignType(DesignType.valueOf(value.toUpperCase()));break;
            case "referencetype":((Rocket)c).setReferenceType(ReferenceType.valueOf(value.toUpperCase()));break;
            case "axialoffset":case "position":c.setAxialMethod(AxialMethod.valueOf(text(key+(field.equals("position")?"/@type":"/@method")).toUpperCase()));c.setAxialOffset(num(key));break;
            case "overridemass":c.setOverrideMass(num(key));c.setMassOverridden(true);break;
            case "overridecg":c.setOverrideCGX(num(key));c.setCGOverridden(true);break;
            case "overridecd":c.setOverrideCD(num(key));c.setCDOverridden(true);break;
            case "overridesubcomponentsmass":c.setSubcomponentsOverriddenMass(bool(key));break;
            case "overridesubcomponentscg":c.setSubcomponentsOverriddenCG(bool(key));break;
            case "overridesubcomponentscd":c.setSubcomponentsOverriddenCD(bool(key));break;
            case "material":{Material m=material(key);if(c instanceof ExternalComponent e)e.setMaterial(m);else if(c instanceof StructuralComponent s)s.setMaterial(m);else if(c instanceof RecoveryDevice d)d.setMaterial(m);else ((ShockCord)c).setMaterial(m);break;}
            case "finish":((ExternalComponent)c).setFinish(ExternalComponent.Finish.valueOf(value.toUpperCase()));break;
            case "length":if(c instanceof BodyComponent b)b.setLength(num(key));else if(c instanceof TubeFinSet t)t.setLength(num(key));else if(c instanceof LaunchLug l)l.setLength(num(key));else ((RingComponent)c).setLength(num(key));break;
            case "thickness":if(c instanceof FinSet f)f.setThickness(num(key));else if(c instanceof SymmetricComponent s){if(value.equals("filled"))s.setFilled(true);else s.setThickness(num(key),false);}else if(c instanceof TubeFinSet t)t.setThickness(num(key));else if(c instanceof LaunchLug l)l.setThickness(num(key));else ((ThicknessRingComponent)c).setThickness(num(key));break;
            case "radius":{if(c instanceof BodyTube b){b.setOuterRadius(dimension(key));b.setOuterRadiusAutomatic(auto(key));}else if(c instanceof TubeFinSet t){if(!value.equals("auto"))t.setOuterRadius(dimension(key));t.setOuterRadiusAutomatic(auto(key));}else ((LaunchLug)c).setOuterRadius(num(key));break;}
            case "outerradius":if(c instanceof InnerTube t)t.setOuterRadius(num(key));else {RingComponent b=(RingComponent)c;if(!value.equals("auto"))b.setOuterRadius(dimension(key));if(b instanceof Bulkhead v)v.setOuterRadiusAutomatic(auto(key));else if(b instanceof CenteringRing v)v.setOuterRadiusAutomatic(auto(key));else if(b instanceof TubeCoupler v)v.setOuterRadiusAutomatic(auto(key));else if(b instanceof EngineBlock v)v.setOuterRadiusAutomatic(auto(key));}break;
            case "innerradius":{RingComponent b=(RingComponent)c;if(!value.equals("auto"))b.setInnerRadius(dimension(key));((CenteringRing)b).setInnerRadiusAutomatic(auto(key));break;}
            case "shape":((Transition)c).setShapeType(Transition.Shape.valueOf(value.toUpperCase()));break;
            case "shapeparameter":((Transition)c).setShapeParameter(num(key));break;
            case "shapeclipped":((Transition)c).setClipped(bool(key));break;
            case "aftradius":{Transition t=(Transition)c;t.setAftRadius(dimension(key),false);t.setAftRadiusAutomatic(auto(key),false);break;}
            case "foreradius":{Transition t=(Transition)c;t.setForeRadius(dimension(key),false);t.setForeRadiusAutomatic(auto(key),false);break;}
            case "aftshoulderradius":((Transition)c).setAftShoulderRadius(num(key),false);break;
            case "aftshoulderlength":((Transition)c).setAftShoulderLength(num(key));break;
            case "aftshoulderthickness":((Transition)c).setAftShoulderThickness(num(key));break;
            case "aftshouldercapped":((Transition)c).setAftShoulderCapped(bool(key));break;
            case "foreshoulderradius":((Transition)c).setForeShoulderRadius(num(key),false);break;
            case "foreshoulderlength":((Transition)c).setForeShoulderLength(num(key));break;
            case "foreshoulderthickness":((Transition)c).setForeShoulderThickness(num(key));break;
            case "foreshouldercapped":((Transition)c).setForeShoulderCapped(bool(key));break;
            case "isflipped":((NoseCone)c).setFlipped(bool(key),false);break;
            case "packedlength":((MassObject)c).setLength(num(key));break;
            case "packedradius":{MassObject m=(MassObject)c;if(!value.equals("auto"))m.setRadius(dimension(key));m.setRadiusAutomatic(auto(key));break;}
            case "radialposition":if(c instanceof MassObject m)m.setRadialPosition(num(key));else ((RingComponent)c).setRadialPosition(num(key));break;
            case "radialdirection":if(c instanceof MassObject m)m.setRadialDirection((num(key)*(Math.PI/180.0)));else if(c instanceof LaunchLug l)l.setAngleOffset(Math.toRadians(num(key)));else ((RingComponent)c).setRadialDirection((num(key)*(Math.PI/180.0)));break;
            case "mass":((MassComponent)c).setComponentMass(num(key));break;
            case "masscomponenttype":((MassComponent)c).setMassComponentType(MassComponent.MassComponentType.valueOf(value.toUpperCase()));break;
            case "cordlength":{ShockCord s=(ShockCord)c;if(value.equals("auto"))s.setCordLengthAutomatic(true);else s.setCordLength(num(key));break;}
            case "clusterconfiguration":if(!value.equals("single"))throw new IllegalArgumentException("Clusters unsupported");((InnerTube)c).setClusterConfiguration(ClusterConfiguration.SINGLE);break;
            case "clusterscale":((InnerTube)c).setClusterScale(num(key));break;
            case "clusterrotation":((InnerTube)c).setClusterRotation((num(key)*(Math.PI/180.0)));break;
            case "instancecount":((Instanceable)c).setInstanceCount((int)num(key));break;
            case "instanceseparation":((LineInstanceable)c).setInstanceSeparation(num(key));break;
            case "fincount":if(c instanceof TubeFinSet t)t.setFinCount((int)num(key));else ((FinSet)c).setFinCount((int)num(key));break;
            case "rotation":if(c instanceof TubeFinSet t)t.setBaseRotation(Math.toRadians(num(key)));else ((FinSet)c).setBaseRotation(Math.toRadians(num(key)));break;
            case "angleoffset":((AnglePositionable)c).setAngleMethod(AngleMethod.valueOf(text(key+"/@method").toUpperCase()));((AnglePositionable)c).setAngleOffset(Math.toRadians(num(key)));break;
            case "radiusoffset":((RadiusPositionable)c).setRadius(RadiusMethod.valueOf(text(key+"/@method").toUpperCase()),num(key));break;
            case "crosssection":((FinSet)c).setCrossSection(FinSet.CrossSection.valueOf(value.toUpperCase()));break;
            case "cant":((FinSet)c).setCantAngle((num(key)*(Math.PI/180.0)));break;
            case "filletradius":((FinSet)c).setFilletRadius(num(key));break;
            case "filletmaterial":((FinSet)c).setFilletMaterial(material(key));break;
            case "rootchord":if(c instanceof EllipticalFinSet f)f.setLength(num(key));else ((TrapezoidFinSet)c).setRootChord(num(key));break;
            case "tipchord":((TrapezoidFinSet)c).setTipChord(num(key));break;
            case "sweeplength":((TrapezoidFinSet)c).setSweep(num(key));break;
            case "height":if(c instanceof EllipticalFinSet f)f.setHeight(num(key));else if(c instanceof RailButton r)r.setTotalHeight(num(key));else ((TrapezoidFinSet)c).setHeight(num(key));break;
            case "outerdiameter":((RailButton)c).setOuterDiameter(num(key));break;
            case "innerdiameter":((RailButton)c).setInnerDiameter(num(key));break;
            case "baseheight":((RailButton)c).setBaseHeight(num(key));break;
            case "flangeheight":((RailButton)c).setFlangeHeight(num(key));break;
            case "screwheight":((RailButton)c).setScrewHeight(num(key));break;
            case "striplength":((Streamer)c).setStripLength(num(key));break;
            case "stripwidth":((Streamer)c).setStripWidth(num(key));break;
            case "cd":if(value.equals("auto"))((RecoveryDevice)c).setCDAutomatic(true);else ((RecoveryDevice)c).setCD(num(key));break;
            case "deployevent":((RecoveryDevice)c).getDeploymentConfigurations().getDefault().setDeployEvent(deploy(value));break;
            case "deployaltitude":((RecoveryDevice)c).getDeploymentConfigurations().getDefault().setDeployAltitude(num(key));break;
            case "deploydelay":((RecoveryDevice)c).getDeploymentConfigurations().getDefault().setDeployDelay(num(key));break;
            case "isdrogue":((RecoveryDevice)c).setDrogue(bool(key));break;
            case "diameter":((Parachute)c).setDiameter(num(key));break;
            case "linecount":((Parachute)c).setLineCount((int)num(key));break;
            case "linelength":if(value.equals("auto"))((Parachute)c).setLineLengthAutomatic(true);else ((Parachute)c).setLineLength(num(key));break;
            case "linematerial":((Parachute)c).setLineMaterial(material(key));break;
            case "preset":{var p=FlightPresetCatalog.preset();if(!p.getDigest().equals(text(key+"/@digest")))throw new IllegalArgumentException("Preset digest mismatch");((Parachute)c).loadPreset(p,false);break;}
            default:throw new IllegalArgumentException("Unrepresented simulation field "+field);
        }
    }
    void motors(MotorMount mount,String prefix) {
        mount.setMotorMount(true);mount.setMotorOverhang(num(prefix+"overhang"));
        mount.getDefaultMotorConfig().setIgnitionEvent(IgnitionEvent.valueOf(text(prefix+"ignitionevent").toUpperCase()));mount.getDefaultMotorConfig().setIgnitionDelay(num(prefix+"ignitiondelay"));
        for(FlightConfigurationId id:configurations) {
            String p=prefix+"motor/"+id+"/";if(!fields.containsKey(p+"digest"))continue;
            ThrustCurveMotor motor=motor(text(p+"digest"));
            if(!motor.getDesignation().equals(text(p+"designation"))||!motor.getManufacturer().matches(text(p+"manufacturer"))||Math.abs(motor.getDiameter()-num(p+"diameter"))>1e-12||Math.abs(motor.getLength()-num(p+"length"))>1e-12||!motor.getMotorType().name().equalsIgnoreCase(text(p+"type")))throw new IllegalArgumentException("Motor reference differs from embedded curve");
            MotorConfiguration mc=new MotorConfiguration(mount,id);mc.setMotor(motor);mc.setEjectionDelay(text(p+"delay").equals("none")?Double.POSITIVE_INFINITY:num(p+"delay"));
            String ignition=prefix+"ignitionconfiguration/"+id+"/";if(fields.containsKey(ignition+"ignitionevent")){mc.setIgnitionEvent(IgnitionEvent.valueOf(text(ignition+"ignitionevent").toUpperCase()));mc.setIgnitionDelay(num(ignition+"ignitiondelay"));}
            mount.setMotorConfig(mc,id);if(id.equals(selected))selectedMotor=motor;
        }
    }
    ThrustCurveMotor motor(String expected) {
        String p="curve/"+expected+"/";if(!text(p+"@auto-calc-mass").equals("0")||!text(p+"@auto-calc-cg").equals("0"))throw new IllegalArgumentException("Motor requires explicit mass/CG samples");
        List<Double> time=new ArrayList<>(),force=new ArrayList<>(),mass=new ArrayList<>(),cg=new ArrayList<>();
        for(int i=0;i<(int)num(p+"count");i++){time.add(num(p+i+"/t"));force.add(num(p+i+"/f"));mass.add(num(p+i+"/m")/1000);cg.add(num(p+i+"/cg")/1000);}
        BrowserCurve.normalize(time,force,mass,cg);double[] t=new double[time.size()],f=new double[time.size()];CoordinateIF[] c=new CoordinateIF[time.size()];
        for(int i=0;i<t.length;i++){t[i]=time.get(i);f[i]=force.get(i);c[i]=new Coordinate(cg.get(i),0,0,mass.get(i));}
        String delay=fields.get(p+"@delays");List<Double> ds=new ArrayList<>();if(delay!=null&&!delay.isBlank())for(String d:delay.split(","))ds.add(Double.parseDouble(d));double[] delays=new double[ds.size()];for(int i=0;i<delays.length;i++)delays[i]=ds.get(i);
        Motor.Type type=switch(text(p+"@Type").toLowerCase()){case "single-use"->Motor.Type.SINGLE;case "reloadable"->Motor.Type.RELOAD;case "hybrid"->Motor.Type.HYBRID;default->throw new IllegalArgumentException("Unknown motor type");};
        var builder=new ThrustCurveMotor.Builder().setManufacturer(Manufacturer.getManufacturer(text(p+"@mfg"))).setDesignation(text(p+"@code")).setMotorType(type).setDiameter(num(p+"@dia")/1000).setLength(num(p+"@len")/1000).setStandardDelays(delays).setTimePoints(t).setThrustPoints(f).setCGPoints(c).setDigest("unverified");
        var m=builder.build();m=builder.setDigest(MotorDigest.digestMotor(m)).build();if(!MotorDigest.isDigestCompatible(m,expected))throw new IllegalArgumentException("Embedded motor digest mismatch");return builder.setDigest(expected).build();
    }
    public static String run(String input,boolean rk6)throws Exception{var model=new ImportedRocketFlight(input);Simulation s=new Simulation(model.rocket);s.setFlightConfigurationId(model.selected);return model.fields.containsKey("run/timestep") ? ImportedFlight.simulate(model.rocket,model.selectedMotor,s,rk6,SavedFlightOptions.conditions(model.fields,s)) : ImportedFlight.simulate(model.rocket,model.selectedMotor,s,rk6,600);}
}
