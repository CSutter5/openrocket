import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import com.google.gson.GsonBuilder;
import info.openrocket.core.database.motor.MotorDatabase;
import info.openrocket.core.database.motor.ThrustCurveMotorSetDatabase;
import info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase;
import info.openrocket.core.document.OpenRocketDocument;
import info.openrocket.core.file.GeneralRocketLoader;
import info.openrocket.core.file.GeneralRocketSaver;
import info.openrocket.core.file.openrocket.OpenRocketSaverTest;
import info.openrocket.core.motor.ThrustCurveMotor;
import info.openrocket.core.rocketcomponent.BodyTube;
import info.openrocket.core.rocketcomponent.MotorMount;
import info.openrocket.core.rocketcomponent.RocketComponent;
import info.openrocket.core.startup.Application;

/** Actual-document oracle for lexical BodyTube radius edits; development JVM only. */
public class RadiusDesktopProof {
    static Map<String, Object> scalar(BodyTube tube) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("radius", tube.getOuterRadius()); result.put("thickness", tube.getThickness());
        result.put("automatic", tube.isOuterRadiusAutomatic()); result.put("preset", tube.getPresetComponent() != null);
        result.put("mass", tube.getComponentMass()); result.put("cg", tube.getComponentCG().getX());
        return result;
    }
    static Map<String, Object> input(BodyTube tube) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schema", 1); result.put("componentId", tube.getID().toString());
        result.put("length", tube.getLength()); result.put("radius", tube.getOuterRadius());
        result.put("thickness", tube.getThickness()); result.put("filled", tube.isFilled());
        result.put("density", tube.getMaterial().getDensity()); return result;
    }
    static Map<String, Object> counts(OpenRocketDocument document) throws Exception {
        int components = 0, decals = 0, assignments = 0, resultPoints = 0;
        for (RocketComponent component : document.getRocket()) {
            components++;
            if (component.getAppearance() != null && component.getAppearance().getTexture() != null) {
                try (var stream = component.getAppearance().getTexture().getImage().getBytes()) {
                    ArchiveDesktopProof.require(stream.readAllBytes().length > 0, "Empty decal");
                }
                decals++;
            }
            if (component instanceof MotorMount mount && mount.isMotorMount()) {
                for (var id : document.getRocket().getIds()) if (mount.getMotorConfig(id).getMotor() != null) assignments++;
            }
        }
        for (var simulation : document.getSimulations()) {
            var data = simulation.getSimulatedData();
            if (data != null) for (int i = 0; i < data.getBranchCount(); i++) resultPoints += data.getBranch(i).getLength();
        }
        return Map.of("components", components, "decals", decals, "motorAssignments", assignments,
            "simulations", document.getSimulations().size(), "resultPoints", resultPoints);
    }
    public static void main(String[] args) throws Exception {
        ArchiveDesktopProof.require(args.length == 5, "original.ork edited.ork targetId value reportPath");
        Path reportPath = Path.of(args[4]).toAbsolutePath(), output = reportPath.getParent();
        Files.createDirectories(output);
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("baseline", "33bdb6d3062a6d9ef44a00d1ff865f962136e9e9");
        report.put("targetId", args[2]); report.put("requestedRadius", Double.parseDouble(args[3]));
        report.put("inputSha256", ArchiveDesktopProof.hash(Files.readAllBytes(Path.of(args[0]))));
        report.put("editedSha256", ArchiveDesktopProof.hash(Files.readAllBytes(Path.of(args[1]))));
        try {
            OpenRocketSaverTest.setup();
            String catalog = System.getProperty("ork.proof.motorCatalog");
            if (catalog != null) {
                var database = (ThrustCurveMotorSetDatabase) Application.getInjector().getInstance(MotorDatabase.class);
                for (ThrustCurveMotor motor : ThrustCurveMotorSQLiteDatabase.readDatabase(new File(catalog))) database.addMotor(motor);
                report.put("catalogSha256", ArchiveDesktopProof.hash(Files.readAllBytes(Path.of(catalog))));
            }
            var originalLoader = new GeneralRocketLoader(new File(args[0]));
            var editedLoader = new GeneralRocketLoader(new File(args[1]));
            var original = originalLoader.load(); var edited = editedLoader.load();
            report.put("originalWarnings", originalLoader.getWarnings().toString());
            report.put("editedWarnings", editedLoader.getWarnings().toString());
            var component = original.getRocket().findComponent(UUID.fromString(args[2]));
            ArchiveDesktopProof.require(component instanceof BodyTube, "Target is not a BodyTube");
            var tube = (BodyTube) component;
            report.put("input", input(tube)); report.put("before", scalar(tube));
            tube.setOuterRadius(Double.parseDouble(args[3])); report.put("after", scalar(tube));
            var actual = (BodyTube) edited.getRocket().findComponent(UUID.fromString(args[2]));
            report.put("editedProjection", scalar(actual));
            ArchiveDesktopProof.require(scalar(tube).equals(scalar(actual)), "Intrinsic scalar projection differs");
            byte[] expectedXml = ArchiveDesktopProof.semanticXml(original), actualXml = ArchiveDesktopProof.semanticXml(edited);
            report.put("setterSemanticXmlEqual", java.util.Arrays.equals(expectedXml, actualXml));
            report.put("semanticSha256", ArchiveDesktopProof.hash(actualXml));
            ArchiveDesktopProof.requireSameMotorCurves(original, edited); report.put("motorCurvesEqual", true);
            report.put("counts", counts(edited));
            ArchiveDesktopProof.requireSameXml(expectedXml, actualXml, "Actual document Java setter differs from edited archive", output);
            Path desktop = output.resolve("radius-desktop-resaved.ork");
            new GeneralRocketSaver().save(desktop.toFile(), edited, ArchiveDesktopProof.options());
            var reloaded = new GeneralRocketLoader(desktop.toFile()).load();
            ArchiveDesktopProof.requireSameXml(actualXml, ArchiveDesktopProof.semanticXml(reloaded), "Radius desktop re-export drift", output);
            ArchiveDesktopProof.requireSameMotorCurves(edited, reloaded);
            report.put("desktopReloadSemanticXmlEqual", true); report.put("desktopReloadMotorCurvesEqual", true);
            report.put("desktopExportSha256", ArchiveDesktopProof.hash(Files.readAllBytes(desktop)));
            report.put("outcome", "passed");
        } catch (Throwable failure) {
            report.put("outcome", "failed"); report.put("error", failure.toString());
            throw failure;
        } finally {
            Files.writeString(reportPath, new GsonBuilder().setPrettyPrinting().create().toJson(report) + "\n");
        }
    }
}
