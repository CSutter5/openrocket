import java.io.File;
import java.nio.file.*;
import java.util.*;
import com.google.gson.*;
import info.openrocket.core.file.*;
import info.openrocket.core.rocketcomponent.*;
import proof.EditorDrawing;
import proof.ImportedTubeProof;

/** Actual loaded desktop geometry and property round-trip oracle; development only. */
public class EditorDesktopProof {
    static Object state(BodyTube tube) { return JsonParser.parseString(ImportedTubeProof.presetSnapshot(tube)); }
    public static void main(String[] args) throws Exception {
        ImportedEffectsDesktopProof.setup();
        var original = new GeneralRocketLoader(new File(args[1])).load();
        if (args[0].equals("drawing")) {
            List<RocketComponent> components = new ArrayList<>();
            for (String id : Files.readString(Path.of(args[2])).trim().split("\n")) components.add(original.getRocket().findComponent(UUID.fromString(id)));
            Files.writeString(Path.of(args[3]), EditorDrawing.snapshot(components)); return;
        }
        if (!args[0].equals("property")) throw new IllegalArgumentException("Unknown oracle action");
        Path reportPath = Path.of(args[6]), directory = reportPath.getParent(); Files.createDirectories(directory);
        Map<String,Object> report = new LinkedHashMap<>();
        try {
            var edited = new GeneralRocketLoader(new File(args[2])).load();
            var tube = (BodyTube) original.getRocket().findComponent(UUID.fromString(args[3]));
            var actual = (BodyTube) edited.getRocket().findComponent(tube.getID());
            report.put("before", state(tube)); report.put("statusesBefore", ImportedEffectsDesktopProof.statuses(original));
            var modification = original.getRocket().getFunctionalModID(); double value = Double.parseDouble(args[5]);
            switch (args[4]) {
                case "length": tube.setLength(value); break;
                case "thickness": tube.setThickness(value); break;
                default: throw new IllegalArgumentException("Unsupported property");
            }
            report.put("functionalChange", modification != original.getRocket().getFunctionalModID());
            report.put("after", state(tube)); report.put("statusesAfter", ImportedEffectsDesktopProof.statuses(edited));
            ArchiveDesktopProof.require(state(tube).equals(state(actual)), "Full intrinsic property state differs");
            byte[] xml = ArchiveDesktopProof.semanticXml(edited);
            ArchiveDesktopProof.requireSameXml(ArchiveDesktopProof.semanticXml(original), xml, "Property full serialization differs", directory);
            ArchiveDesktopProof.requireSameMotorCurves(original, edited);
            Path saved = directory.resolve("desktop-resaved.ork");
            new GeneralRocketSaver().save(saved.toFile(), edited, ArchiveDesktopProof.options());
            var reloaded = new GeneralRocketLoader(saved.toFile()).load();
            ArchiveDesktopProof.requireSameXml(xml, ArchiveDesktopProof.semanticXml(reloaded), "Property desktop reload differs", directory);
            ArchiveDesktopProof.requireSameMotorCurves(edited, reloaded);
            ArchiveDesktopProof.require(state(actual).equals(state((BodyTube) reloaded.getRocket().findComponent(tube.getID()))), "Reload intrinsic state differs");
            report.put("counts", RadiusDesktopProof.counts(edited)); report.put("fullSerializationEqual",true); report.put("desktopReloadEqual",true); report.put("outcome","passed");
        } catch(Throwable error) { report.put("outcome","failed");report.put("error",error.toString());throw error; }
        finally { Files.writeString(reportPath,new GsonBuilder().setPrettyPrinting().create().toJson(report)); }
    }
}
