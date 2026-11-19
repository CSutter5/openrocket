import java.io.File;
import java.nio.file.*;
import java.util.*;
import info.openrocket.core.document.*;
import info.openrocket.core.file.*;
import info.openrocket.core.motor.*;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.rocketcomponent.position.AxialMethod;
import info.openrocket.core.preset.*;
import info.openrocket.core.startup.Application;
import proof.*;

/** Independent owned fixture and actual desktop-loaded reference; no user-file dependency. */
public class ImportedFlightDesktopProof {
    public static void main(String[] args)throws Exception {
        ImportedEffectsDesktopProof.setup();
        var preset=ComponentPresetFactory.create(FlightPresetCatalog.properties());
        if(!preset.getDigest().equals(FlightPresetCatalog.preset().getDigest())||!preset.getDigest().equals("3712e18a34970eb9fdfd4e170ffabc6d"))throw new AssertionError("Pinned preset digest differs");
        Application.getComponentPresetDao().insert(preset);
        var database=(info.openrocket.core.database.motor.ThrustCurveMotorSetDatabase)Application.getInjector().getInstance(info.openrocket.core.database.motor.MotorDatabase.class);
        for(var m:info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase.readDatabase(new File("core/src/main/resources/datafiles/thrustcurves/initial_motors.db")))database.addMotor(m);
        if(args[0].equals("generate")) {
            var doc=new GeneralRocketLoader(new File(args[1])).load();Rocket r=doc.getRocket();
            BodyTube body=null;InnerTube inner=null;Parachute first=null;
            for(var c:r){if(c instanceof BodyTube b)body=b;if(c instanceof InnerTube t)inner=t;if(c instanceof Parachute p)first=p;}
            var selected=r.getSelectedConfiguration().getFlightConfigurationID();Motor motor=null;for(var m:info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase.readDatabase(new File("core/src/main/resources/datafiles/thrustcurves/initial_motors.db")))if(m.getDigest().equals("acee08976425e0ddc8b9bfc014a91770"))motor=m;
            if(motor==null)throw new AssertionError("Pinned J135W missing");inner.setMotorMount(false);
            body.setLength(1.2);body.setOuterRadius(.035);body.setThickness(.001);body.setOverrideMass(1.4);body.setMassOverridden(true);body.setOverrideCGX(.6);body.setCGOverridden(true);
            inner.setLength(.4);inner.setOuterRadius(.029);inner.setThickness(.0015);
            for(var c:r){if(c instanceof NoseCone n){n.setLength(.2);n.setAftRadius(.035);}if(c instanceof TrapezoidFinSet f)f.setFinShape(.16,.08,.03,.08,.004);}
            Transition transition=new Transition();((AxialStage)body.getParent()).addChild(transition,1);transition.setLength(.08);transition.setForeRadius(.035,false);transition.setForeRadiusAutomatic(true,false);transition.setAftRadius(.035,false);transition.setThickness(.0005);
            first.setDiameter(.22);first.getDeploymentConfigurations().getDefault().setDeployEvent(DeploymentConfiguration.DeployEvent.APOGEE);
            Parachute main=new Parachute();body.addChild(main);main.setIgnorePresetClearing(true);main.loadPreset(preset,false);main.setOverrideMass(.05);main.setMassOverridden(true);main.setAxialMethod(AxialMethod.TOP);main.setAxialOffset(.03);main.getDeploymentConfigurations().getDefault().setDeployEvent(DeploymentConfiguration.DeployEvent.ALTITUDE);main.getDeploymentConfigurations().getDefault().setDeployAltitude(30);main.setIgnorePresetClearing(false);
            for(int i=0;i<3;i++){MassComponent mass=new MassComponent();body.addChild(mass);mass.setComponentMass(.001+i*.0005);mass.setLength(.01);mass.setRadius(.004);mass.setAxialOffset(.02+i*.03);if(i==0){mass.setOverrideMass(.002);mass.setMassOverridden(true);mass.setOverrideCGX(.003);mass.setCGOverridden(true);}}
            Bulkhead cap=new Bulkhead();inner.addChild(cap);cap.setLength(.002);cap.setOuterRadius(.009);cap.setAxialOffset(.01);
            ShockCord cord=new ShockCord();body.addChild(cord);cord.setCordLength(.10);cord.setLength(.02);cord.setRadius(.004);cord.setOverrideMass(.001);cord.setMassOverridden(true);
            body.setMotorMount(true);
            for(int i=0;i<5;i++){var id=i==0?selected:new FlightConfigurationId("9000000"+i+"-0000-4000-8000-000000000000");r.createFlightConfiguration(id);MotorConfiguration mc=new MotorConfiguration(body,id);mc.setMotor(motor);mc.setEjectionDelay(5+i);body.setMotorConfig(mc,id);if(i==1){DeploymentConfiguration dc=new DeploymentConfiguration();dc.setDeployEvent(DeploymentConfiguration.DeployEvent.APOGEE);dc.setDeployAltitude(50);dc.setDeployDelay(.2);main.getDeploymentConfigurations().set(id,dc);}}
            r.setSelectedConfiguration(selected);int i=0;for(var c:r){c.setID(String.format("910000%02d-0000-4000-8000-000000000000",i++));if(c instanceof MassComponent)c.setName("Ballast "+i);}
            Simulation historical=new Simulation(doc,r);historical.setFlightConfigurationId(selected);historical.setName("Imported conditions retained, new local run is separate");doc.addSimulation(historical);
            new GeneralRocketSaver().save(new File(args[2]),doc,ArchiveDesktopProof.options());return;
        }
        if(!args[0].equals("reference"))throw new IllegalArgumentException("Unknown action");
        var doc=new GeneralRocketLoader(new File(args[1])).load();var model=new ImportedRocketFlight(Files.readString(Path.of(args[2])));
        Rocket r=doc.getRocket();var id=r.getSelectedConfiguration().getFlightConfigurationID();ThrustCurveMotor motor=null;
        for(var c:r)if(c instanceof MotorMount m&&m.isMotorMount())motor=(ThrustCurveMotor)m.getMotorConfig(id).getMotor();
        String expected=new String(ArchiveDesktopProof.semanticXml(doc),java.nio.charset.StandardCharsets.UTF_8);
        String actual=new String(ArchiveDesktopProof.semanticXml(OpenRocketDocumentFactory.createDocumentFromRocket(model.rocket)),java.nio.charset.StandardCharsets.UTF_8);
        Files.writeString(Path.of(args[3]+"-desktop.xml"),expected);Files.writeString(Path.of(args[3]+"-reconstructed.xml"),actual);
        String left=expected.substring(expected.indexOf("<rocket>"),expected.indexOf("</rocket>")),right=actual.substring(actual.indexOf("<rocket>"),actual.indexOf("</rocket>"));
        // Visual appearance is preserved in the archive, outside the flight model.
        left=left.replaceAll("(?s)\\s*<appearance>.*?</appearance>","");right=right.replaceAll("(?s)\\s*<appearance>.*?</appearance>","");
        if(!left.equals(right))throw new AssertionError("Complete reconstructed rocket/configuration serialization differs: "+args[3]);
        var sim=new Simulation(doc,r);sim.setFlightConfigurationId(id);Files.writeString(Path.of(args[3]),ImportedFlight.simulate(r,motor,sim,Boolean.parseBoolean(args[4]),600));
    }
}
