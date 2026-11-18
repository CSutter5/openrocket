import java.io.File;
import java.nio.file.*;
import java.util.*;
import com.google.gson.*;
import info.openrocket.core.file.*;
import info.openrocket.core.file.openrocket.OpenRocketSaverTest;
import info.openrocket.core.rocketcomponent.*;
import proof.EditorDrawing;

/** Actual loaded desktop geometry and property round-trip oracle; development only. */
public class EditorDesktopProof {
    public static void main(String[] args) throws Exception {
        OpenRocketSaverTest.setup();
        var original = new GeneralRocketLoader(new File(args[1])).load();
        if (args[0].equals("drawing")) {
            List<RocketComponent> components = new ArrayList<>();
            for (String id : Files.readString(Path.of(args[2])).trim().split("\n")) components.add(original.getRocket().findComponent(UUID.fromString(id)));
            Files.writeString(Path.of(args[3]), EditorDrawing.snapshot(components));
            return;
        }
        throw new IllegalArgumentException("Unknown oracle action");
    }
}
