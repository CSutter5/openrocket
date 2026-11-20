import java.io.File;
import java.nio.file.*;
import java.util.*;
import com.google.gson.*;
import info.openrocket.core.file.*;
import info.openrocket.core.rocketcomponent.*;
import proof.EditorStability;

/** Native creation and stability oracle using actual desktop-loaded archives. */
public class ComponentDesktopProof {
    public static void main(String[] args) throws Exception {
        ImportedEffectsDesktopProof.setup();
        var original = new GeneralRocketLoader(new File(args[1])).load();
        if (args[0].equals("stability")) {
            if (!args[2].equals("default")) original.getRocket().setSelectedConfiguration(new FlightConfigurationId(args[2]));
            Files.writeString(Path.of(args[3]), EditorStability.snapshot(original.getRocket().getSelectedConfiguration()));return;
        }
        var edited = new GeneralRocketLoader(new File(args[2])).load();
        var actual = edited.getRocket().findComponent(UUID.fromString(args[3]));
        if (actual == null) throw new AssertionError("New component missing");
        var expected = actual.getClass().getConstructor().newInstance();
        expected.setID(actual.getID());expected.setName(actual.getName());
        if (expected instanceof TubeFinSet fins) fins.setThickness(new BodyTube().getThickness());
        var parent = original.getRocket().findComponent(UUID.fromString(args[4]));
        parent.addChild(expected,Integer.parseInt(args[5]));
        Path directory = Path.of(args[6]);Files.createDirectories(directory);
        ArchiveDesktopProof.requireSameXml(ArchiveDesktopProof.semanticXml(original), ArchiveDesktopProof.semanticXml(edited), "Native creation differs", directory);
        ArchiveDesktopProof.requireSameMotorCurves(original,edited);
        var saved = directory.resolve("desktop-resaved.ork");
        new GeneralRocketSaver().save(saved.toFile(),edited,ArchiveDesktopProof.options());
        var reloaded = new GeneralRocketLoader(saved.toFile()).load();
        ArchiveDesktopProof.requireSameXml(ArchiveDesktopProof.semanticXml(edited),ArchiveDesktopProof.semanticXml(reloaded),"Desktop creation reload differs",directory);
        Files.writeString(directory.resolve("report.json"),new Gson().toJson(Map.of("outcome","passed","component",actual.getClass().getSimpleName(),"fullSerializationEqual",true,"desktopReloadEqual",true)));
    }
}
