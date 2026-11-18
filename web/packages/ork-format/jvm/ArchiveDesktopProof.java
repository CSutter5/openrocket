import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import info.openrocket.core.document.*;
import info.openrocket.core.file.*;
import info.openrocket.core.file.openrocket.*;
import info.openrocket.core.logging.*;
import info.openrocket.core.motor.*;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.simulation.*;

/** Development-only bridge: execute the pinned desktop loader and saver headlessly. */
public class ArchiveDesktopProof {
    static StorageOptions options() {
        StorageOptions options = new StorageOptions(); options.setSaveSimulationData(true); return options;
    }
    static byte[] semanticXml(OpenRocketDocument doc) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        new OpenRocketSaver().save(out, doc, options(), new WarningSet(), new ErrorSet());
        return out.toByteArray();
    }
    static String hash(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }
    static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    static void requireSameXml(byte[] expected, byte[] actual, String message, Path output) throws Exception {
        if (Arrays.equals(expected, actual)) return;
        Files.write(output.resolve("expected.xml"), expected);
        Files.write(output.resolve("actual.xml"), actual);
        throw new AssertionError(message + "; see expected.xml and actual.xml");
    }
    public static void main(String[] args) throws Exception {
        OpenRocketSaverTest.setup();
        if (args.length == 3 && args[0].equals("generate-format111")) {
            var generated = new GeneralRocketLoader(new File(args[1])).load();
            var settings = generated.getSimulations().get(0).getOptions();
            settings.setSimulationStepperMethodChoice(SimulationStepperMethod.RK6);
            settings.setRandomSeed(8447);
            settings.setRandomSeedFixed(true);
            new GeneralRocketSaver().save(new File(args[2]), generated, options());
            var reloaded = new GeneralRocketLoader(new File(args[2])).load();
            var actual = reloaded.getSimulations().get(0).getOptions();
            require(actual.getSimulationStepperMethodChoice() == SimulationStepperMethod.RK6 &&
                actual.isRandomSeedFixed() && actual.getRandomSeed() == 8447, "Format 1.11 settings drift");
            return;
        }
        require(args.length == 5, "original edited desktop-export target-id expected-name");
        var originalLoader = new GeneralRocketLoader(new File(args[0]));
        var editedLoader = new GeneralRocketLoader(new File(args[1]));
        var original = originalLoader.load(); var edited = editedLoader.load();
        System.out.println("LOAD_WARNINGS original=" + originalLoader.getWarnings() + " edited=" + editedLoader.getWarnings());
        RocketComponent target = null;
        int componentCount = 0, decals = 0, motors = 0, resultPoints = 0;
        Set<String> motorDigests = new TreeSet<>();
        for (RocketComponent component : original.getRocket()) {
            componentCount++;
            if (component.getID().toString().equals(args[3])) target = component;
            var appearance = component.getAppearance();
            if (appearance != null && appearance.getTexture() != null) {
                var image = appearance.getTexture().getImage();
                try (var in = image.getBytes()) { require(in.readAllBytes().length > 0, "Empty decal"); }
                decals++;
            }
            if (component instanceof MotorMount mount && mount.isMotorMount()) {
                for (var id : original.getRocket().getIds()) {
                    Motor motor = mount.getMotorConfig(id).getMotor();
                    if (motor instanceof ThrustCurveMotor tcm) {
                        require(tcm.getTimePoints().length > 1, "Missing motor curve");
                        motorDigests.add(tcm.getDigest()); motors++;
                    }
                }
            }
        }
        require(target != null, "Target ID not found");
        target.setName(args[4]);
        Path output = Path.of(args[2]).toAbsolutePath().getParent();
        requireSameXml(semanticXml(original), semanticXml(edited),
            "JVM model serialization differs beyond the requested name (includes IDs/settings/results)", output);
        for (var simulation : edited.getSimulations()) {
            var data = simulation.getSimulatedData();
            if (data != null) for (int i = 0; i < data.getBranchCount(); ++i) resultPoints += data.getBranch(i).getLength();
        }
        System.out.printf("MODEL components=%d decals=%d motorAssignments=%d simulations=%d resultPoints=%d%n",
            componentCount, decals, motors, edited.getSimulations().size(), resultPoints);
        new GeneralRocketSaver().save(new File(args[2]), edited, options());
        var desktopExport = new GeneralRocketLoader(new File(args[2])).load();
        requireSameXml(semanticXml(edited), semanticXml(desktopExport), "Desktop re-export semantic drift", output);
        System.out.printf(Locale.ROOT,
            "PROOF components=%d decals=%d motorAssignments=%d motorDigests=%s simulations=%d resultPoints=%d semanticSha256=%s originalWarnings=%s editedWarnings=%s%n",
            componentCount, decals, motors, motorDigests, edited.getSimulations().size(), resultPoints,
            hash(semanticXml(edited)), originalLoader.getWarnings(), editedLoader.getWarnings());
    }
}
