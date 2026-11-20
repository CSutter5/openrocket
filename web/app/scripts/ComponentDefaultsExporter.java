import java.nio.file.*;
import java.util.*;
import com.google.gson.Gson;
import com.google.inject.*;
import com.google.inject.util.Modules;
import info.openrocket.core.startup.*;
import info.openrocket.core.plugin.PluginModule;
import info.openrocket.core.l10n.*;
import info.openrocket.core.rocketcomponent.*;

/** Build-time native defaults and parent compatibility; no JVM is needed at runtime. */
public class ComponentDefaultsExporter {
    public static final String ID = "00000000-0000-4000-8000-000000000001";
    public static final List<Class<? extends RocketComponent>> TYPES = List.of(AxialStage.class, ParallelStage.class, PodSet.class,
        NoseCone.class, BodyTube.class, Transition.class, TrapezoidFinSet.class, EllipticalFinSet.class, FreeformFinSet.class,
        TubeFinSet.class, RailButton.class, LaunchLug.class, InnerTube.class, TubeCoupler.class, CenteringRing.class,
        Bulkhead.class, EngineBlock.class, Parachute.class, Streamer.class, ShockCord.class, MassComponent.class);
    public static void main(String[] args) throws Exception {
        System.setProperty("openrocket.bypass.presets", "true");
        System.setProperty("openrocket.bypass.motors", "true");
        var module = new CoreModule();
        Application.setInjector(Guice.createInjector(Modules.override(module).with(new AbstractModule() {
            protected void configure() { bind(Translator.class).toInstance(new ResourceBundleTranslator("l10n.messages", Locale.ENGLISH)); }
        }), new PluginModule()));
        module.startLoader();
        Map<String,Object> rows = new LinkedHashMap<>();
        List<RocketComponent> parents = new ArrayList<>();parents.add(new Rocket());
        for (var type : TYPES) parents.add(type.getConstructor().newInstance());
        var exportedTypes = new ArrayList<Class<? extends RocketComponent>>(TYPES);exportedTypes.add(Rocket.class);
        for (var type : exportedTypes) {
            var component = type.getConstructor().newInstance();component.setID(ID);
            if (component instanceof TubeFinSet fins) fins.setThickness(new BodyTube().getThickness());
            var saver = Class.forName("info.openrocket.core.file.openrocket.savers." + (type == ParallelStage.class ? "AxialStage" : type == PodSet.class ? "ComponentAssembly" : type.getSimpleName()) + "Saver");
            @SuppressWarnings("unchecked") var lines = (List<String>)saver.getMethod("getElements", RocketComponent.class).invoke(null, component);
            String xml = String.join("\n", lines), tag = xml.substring(1, xml.indexOf('>'));
            List<String> compatible = new ArrayList<>();
            for (var parent : parents) if (parent.isCompatible(type)) compatible.add(parent instanceof AxialStage && !(parent instanceof ParallelStage) ? "stage" : parent.getClass().getSimpleName().toLowerCase(Locale.ROOT));
            Map<String,Object> row = new LinkedHashMap<>();row.put("name",component.getName());row.put("xml",xml);
            if (type == AxialStage.class) {
                var rocket = new Rocket();rocket.addChild(new AxialStage());rocket.addChild(component);
                row.put("additionalStageXml",String.join("\n",info.openrocket.core.file.openrocket.savers.AxialStageSaver.getElements(component)));
            }
            row.put("parents",compatible);row.put("body",component instanceof BodyComponent);rows.put(tag,row);
        }
        Files.writeString(Path.of(args[0]),new Gson().toJson(rows)+"\n");
        System.out.println("Exported " + rows.size() + " native component defaults and compatibility rules");
    }
}
