package net.sf.openrocket.file.wavefrontobj.export;

import com.google.inject.AbstractModule;
import com.google.inject.Guice;
import com.google.inject.Injector;
import com.google.inject.Module;
import com.google.inject.util.Modules;
import net.sf.openrocket.ServicesForTesting;
import net.sf.openrocket.database.ComponentPresetDao;
import net.sf.openrocket.database.motor.MotorDatabase;
import net.sf.openrocket.document.OpenRocketDocument;
import net.sf.openrocket.document.OpenRocketDocumentFactory;
import net.sf.openrocket.file.GeneralRocketLoader;
import net.sf.openrocket.file.RocketLoadException;
import net.sf.openrocket.file.openrocket.OpenRocketSaverTest;
import net.sf.openrocket.file.wavefrontobj.CoordTransform;
import net.sf.openrocket.file.wavefrontobj.DefaultCoordTransform;
import net.sf.openrocket.l10n.DebugTranslator;
import net.sf.openrocket.l10n.Translator;
import net.sf.openrocket.plugin.PluginModule;
import net.sf.openrocket.rocketcomponent.AxialStage;
import net.sf.openrocket.rocketcomponent.BodyTube;
import net.sf.openrocket.rocketcomponent.CenteringRing;
import net.sf.openrocket.rocketcomponent.InnerTube;
import net.sf.openrocket.rocketcomponent.LaunchLug;
import net.sf.openrocket.rocketcomponent.NoseCone;
import net.sf.openrocket.rocketcomponent.Parachute;
import net.sf.openrocket.rocketcomponent.RailButton;
import net.sf.openrocket.rocketcomponent.Rocket;
import net.sf.openrocket.rocketcomponent.RocketComponent;
import net.sf.openrocket.rocketcomponent.Transition;
import net.sf.openrocket.rocketcomponent.TrapezoidFinSet;
import net.sf.openrocket.rocketcomponent.TubeFinSet;
import net.sf.openrocket.startup.Application;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.fail;

public class OBJExporterFactoryTest {
    private static final File TMP_DIR = new File("./tmp/");

    @BeforeClass
    public static void setup() {
        Module applicationModule = new ServicesForTesting();
        Module pluginModule = new PluginModule();

        Module dbOverrides = new AbstractModule() {
            @Override
            protected void configure() {
                bind(ComponentPresetDao.class).toProvider(new OpenRocketSaverTest.EmptyComponentDbProvider());
                bind(MotorDatabase.class).toProvider(new OpenRocketSaverTest.MotorDbProvider());
                bind(Translator.class).toInstance(new DebugTranslator(null));
            }
        };

        Injector injector = Guice.createInjector(Modules.override(applicationModule).with(dbOverrides), pluginModule);
        Application.setInjector(injector);

        if (!(TMP_DIR.exists() && TMP_DIR.isDirectory())) {
            boolean success = TMP_DIR.mkdirs();
            if (!success) {
                fail("Unable to create core/tmp dir needed for tests.");
            }
        }
    }

    @Test
    public void testExport() throws IOException {
        // Rocket generation
        Rocket rocket = OpenRocketDocumentFactory.createNewRocket().getRocket();
        AxialStage sustainer = rocket.getStage(0);

        NoseCone noseCone = new NoseCone();
        noseCone.setBaseRadius(0.05);
        noseCone.setLength(0.1);
        noseCone.setShoulderLength(0.01);
        noseCone.setShoulderRadius(0.03);
        noseCone.setShoulderThickness(0.002);
        noseCone.setShoulderCapped(false);
        sustainer.addChild(noseCone);

        BodyTube bodyTube = new BodyTube();
        bodyTube.setOuterRadius(0.05);
        bodyTube.setThickness(0.005);
        bodyTube.setLength(0.3);
        sustainer.addChild(bodyTube);

        LaunchLug launchLug = new LaunchLug();
        launchLug.setLength(0.05);
        launchLug.setOuterRadius(0.02);
        launchLug.setThickness(0.005);
        launchLug.setInstanceCount(2);
        launchLug.setInstanceSeparation(0.1);
        bodyTube.addChild(launchLug);

        TrapezoidFinSet finSet = new TrapezoidFinSet();
        finSet.setRootChord(0.05);
        finSet.setThickness(0.005);
        finSet.setTabLength(0.03);
        finSet.setTabHeight(0.01);
        finSet.setTabOffset(-0.0075);
        finSet.setCantAngle(Math.toRadians(10));
        bodyTube.addChild(finSet);

        TubeFinSet tubeFinSet = new TubeFinSet();
        tubeFinSet.setFinCount(4);
        tubeFinSet.setOuterRadius(0.01);
        tubeFinSet.setLength(0.05);
        tubeFinSet.setBaseRotation(Math.PI / 8);
        tubeFinSet.setAxialOffset(-0.1);
        bodyTube.addChild(tubeFinSet);

        Transition transition = new Transition();
        transition.setLength(0.15);
        transition.setForeRadius(0.05);
        transition.setAftRadius(0.025);
        transition.setThickness(0.003);
        transition.setShapeType(Transition.Shape.PARABOLIC);
        transition.setShapeParameter(0.7);
        sustainer.addChild(transition);

        Parachute parachute = new Parachute();
        parachute.setRadiusAutomatic(false);
        parachute.setRadius(0.05);
        parachute.setLength(0.075);
        parachute.setRadialPosition(0.02);
        parachute.setRadialDirection(Math.PI / 3);
        bodyTube.addChild(parachute);

        RailButton railButton = new RailButton();
        railButton.setScrewHeight(0.0025);
        railButton.setAngleOffset(Math.toRadians(67));
        bodyTube.addChild(railButton);

        CenteringRing centeringRing = new CenteringRing();
        centeringRing.setOuterRadius(0.04);
        centeringRing.setInnerRadiusAutomatic(false);
        centeringRing.setInnerRadius(0.03);
        centeringRing.setLength(0.1);
        bodyTube.addChild(centeringRing);

        InnerTube innerTube = new InnerTube();
        bodyTube.addChild(innerTube);


        // ------------------------------


        // Create a list of components to export
        List<RocketComponent> components = List.of(rocket);

        // Create a temp file for storing the exported OBJ
        Path tempFile = Files.createTempFile("testExport", ".obj");
        String filePath = tempFile.toAbsolutePath().toString();

        // Do the exporting
        CoordTransform transformer = new DefaultCoordTransform(rocket.getLength());
        OBJExporterFactory exporterFactory = new OBJExporterFactory(components, rocket.getSelectedConfiguration(), true, false, true,
                transformer, filePath);
        exporterFactory.doExport();


        // Test with other parameters
        noseCone.setShoulderCapped(false);
        railButton.setScrewHeight(0);
        bodyTube.setFilled(true);

        transformer = new DefaultCoordTransform(rocket.getLength());
        exporterFactory = new OBJExporterFactory(components, rocket.getSelectedConfiguration(), false, false, true,
                transformer, filePath);
        exporterFactory.doExport();

        // Clean up
        Files.delete(tempFile);
    }
}
