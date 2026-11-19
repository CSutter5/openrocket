import java.io.File;
import java.nio.file.*;
import java.util.*;
import info.openrocket.core.document.*;
import info.openrocket.core.file.*;
import info.openrocket.core.material.Material;
import info.openrocket.core.motor.*;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.util.*;
import proof.ImportedFlight;

/** Development-only generator and oracle using the actual desktop archive loader. */
public class SimulationDesktopProof {
    public static void main(String[] args) throws Exception {
        ImportedEffectsDesktopProof.setup();
        byte[] vector=new byte[257]; for(int i=0;i<vector.length;i++)vector[i]=(byte)i;
        var portable=proof.PortableDigest.getInstance("MD5"); portable.update(Arrays.copyOfRange(vector,0,100));
        if(!Arrays.equals(portable.digest(Arrays.copyOfRange(vector,100,257)),java.security.MessageDigest.getInstance("MD5").digest(vector))) throw new AssertionError("Incremental MD5 differs from JDK");
        if(!Arrays.equals(portable.digest(),java.security.MessageDigest.getInstance("MD5").digest())) throw new AssertionError("MD5 state did not reset");
        if (args[0].equals("generate")) {
            Rocket rocket = new Rocket(); AxialStage stage = new AxialStage(); rocket.addChild(stage);
            NoseCone nose = new NoseCone(Transition.Shape.OGIVE, 0.07, 0.012); nose.setThickness(0.002); stage.addChild(nose);
            BodyTube body = new BodyTube(0.30, 0.012, 0.0003); stage.addChild(body);
            TrapezoidFinSet fins = new TrapezoidFinSet(3, 0.05, 0.03, 0.02, 0.03); fins.setThickness(0.003); body.addChild(fins);
            InnerTube mount = new InnerTube(); mount.setLength(0.07); mount.setOuterRadius(0.0095); mount.setThickness(0.0005); body.addChild(mount);
            Parachute chute = new Parachute(); chute.setDiameter(0.30); body.addChild(chute);
            int i=0;
            for (RocketComponent c : rocket) {
                c.setID("3000000" + i + "-0000-4000-8000-000000000000"); c.setName(new String[]{"Synthetic motor flight sample", "Sustainer", "Nose cone", "Body tube", "Fins", "Motor mount", "Parachute"}[i++]);
                if (c instanceof ExternalComponent e) e.setMaterial(Material.newMaterial(Material.Type.BULK, "Flight bulk", 950, false));
                if (c instanceof InnerTube t) t.setMaterial(Material.newMaterial(Material.Type.BULK, "Flight bulk", 950, false));
                if (c instanceof Parachute p) {
                    p.setMaterial(Material.newMaterial(Material.Type.SURFACE, "Flight canopy", 0.067, false));
                    p.setLineMaterial(Material.newMaterial(Material.Type.LINE, "Flight cord", 0.0005, false));
                }
            }
            rocket.enableEvents();
            FlightConfigurationId id = new FlightConfigurationId("00000001-0001-4001-8001-000000000001");
            rocket.createFlightConfiguration(id); rocket.setSelectedConfiguration(id);
            double[] times={0,0.1,0.3,0.5,1,1.5,1.85,2}, thrust={0,12,6,5.1,4.9,4.8,4.5,0}, masses={0.0240,0.0231,0.0215,0.0202,0.0174,0.0147,0.0133,0.0132};
            CoordinateIF[] cg=new CoordinateIF[masses.length]; for(i=0;i<cg.length;i++) cg[i]=new Coordinate(0.035,0,0,masses[i]);
            MotorDigest digest=new MotorDigest(); digest.update(MotorDigest.DataType.TIME_ARRAY,times); digest.update(MotorDigest.DataType.MASS_PER_TIME,masses); digest.update(MotorDigest.DataType.CG_PER_TIME,Arrays.stream(cg).mapToDouble(CoordinateIF::getX).toArray()); digest.update(MotorDigest.DataType.FORCE_PER_TIME,thrust);
            ThrustCurveMotor motor=new ThrustCurveMotor.Builder().setManufacturer(Manufacturer.getManufacturer("Estes")).setDesignation("C6 synthetic browser proof").setCommonName("C6 synthetic browser proof")
                .setMotorType(Motor.Type.SINGLE).setStandardDelays(new double[]{3,5,7}).setDiameter(0.018).setLength(0.070).setTimePoints(times).setThrustPoints(thrust).setCGPoints(cg).setDigest(digest.getDigest()).build();
            mount.setMotorMount(true); MotorConfiguration mc=new MotorConfiguration(mount,id); mc.setMotor(motor); mc.setEjectionDelay(5); mount.setMotorConfig(mc,id);
            OpenRocketDocument doc=OpenRocketDocumentFactory.createDocumentFromRocket(rocket);
            new GeneralRocketSaver().save(new File(args[1]),doc,ArchiveDesktopProof.options());
            return;
        }
        if (args[0].equals("reference")) {
            OpenRocketDocument doc=new GeneralRocketLoader(new File(args[1])).load();
            Rocket rocket=doc.getRocket(); ThrustCurveMotor motor=null;
            for(var c:rocket) if(c instanceof InnerTube t && t.isMotorMount()) motor=(ThrustCurveMotor)t.getMotorConfig(rocket.getSelectedConfiguration().getFlightConfigurationID()).getMotor();
            if(motor==null || !MotorDigest.digestMotor(motor).equals(motor.getDigest())) throw new AssertionError("Unresolved or bad motor digest");
            ImportedFlight reconstructed=new ImportedFlight(Files.readString(Path.of(args[2])));
            String expected=ImportedFlight.inputs(rocket,motor), actual=ImportedFlight.inputs(reconstructed.rocket(),reconstructed.motor());
            if(!com.google.gson.JsonParser.parseString(expected).equals(com.google.gson.JsonParser.parseString(actual))) {
                Files.writeString(Path.of(args[3]+"-inputs-expected.json"),expected); Files.writeString(Path.of(args[3]+"-inputs-actual.json"),actual);
                throw new AssertionError("Reconstructed complete input projection differs");
            }
            String desktopXml=new String(ArchiveDesktopProof.semanticXml(doc),java.nio.charset.StandardCharsets.UTF_8);
            String reconstructedXml=new String(ArchiveDesktopProof.semanticXml(OpenRocketDocumentFactory.createDocumentFromRocket(reconstructed.rocket())),java.nio.charset.StandardCharsets.UTF_8);
            Files.writeString(Path.of(args[3]+"-desktop.xml"),desktopXml); Files.writeString(Path.of(args[3]+"-reconstructed.xml"),reconstructedXml);
            if(!desktopXml.substring(desktopXml.indexOf("<rocket>"),desktopXml.indexOf("</rocket>")).equals(reconstructedXml.substring(reconstructedXml.indexOf("<rocket>"),reconstructedXml.indexOf("</rocket>"))))
                throw new AssertionError("Complete reconstructed rocket/configuration serialization differs");
            Simulation sim=new Simulation(doc,rocket); sim.setFlightConfigurationId(rocket.getSelectedConfiguration().getFlightConfigurationID());
            Files.writeString(Path.of(args[3]),ImportedFlight.simulate(rocket,motor,sim,Boolean.parseBoolean(args[4])));
            return;
        }
        throw new IllegalArgumentException("Unknown action");
    }
}
