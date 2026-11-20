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
    static Object privateField(Object object, String name) throws Exception {
        var field = object.getClass().getDeclaredField(name);field.setAccessible(true);return field.get(object);
    }
    static Map<String,Object> fields(Class<?> type) throws Exception {
        var config = Class.forName("info.openrocket.core.file.openrocket.importt.DocumentConfig");
        var field = config.getDeclaredField("setters");field.setAccessible(true);
        var setters = (Map<?,?>)field.get(null);
        Map<String,Object> result = new TreeMap<>();
        for (Class<?> current = type; current != null; current = current.getSuperclass()) {
            for (var entry : setters.entrySet()) {
                String key = entry.getKey().toString(), prefix = current.getSimpleName() + ":";
                if (!key.startsWith(prefix) || result.containsKey(key.substring(prefix.length()))) continue;
                Object setter = entry.getValue();Map<String,Object> rule = new LinkedHashMap<>();
                rule.put("kind",setter == null ? "text" : setter.getClass().getSimpleName());
                if (setter != null && setter.getClass().getSimpleName().equals("EnumSetter")) {
                    var enumType = (Class<?>)privateField(setter,"enumClass");
                    rule.put("values",Arrays.stream(enumType.getEnumConstants()).map(v -> ((Enum<?>)v).name().toLowerCase(Locale.ROOT).replace("_", "")).toList());
                    Map<String,String> labels = new LinkedHashMap<>();
                    for (Object value : enumType.getEnumConstants()) labels.put(((Enum<?>)value).name().toLowerCase(Locale.ROOT).replace("_", ""),value.toString());
                    rule.put("labels",labels);
                }
                if (setter != null && setter.getClass().getSimpleName().equals("ClusterConfigurationSetter")) {
                    rule.put("values",Arrays.stream(ClusterConfiguration.CONFIGURATIONS).map(ClusterConfiguration::getXMLName).toList());
                }
                if (setter != null && setter.getClass().getSimpleName().equals("MaterialSetter")) {
                    rule.put("materialType",((info.openrocket.core.material.Material.Type)privateField(setter,"type")).name().toLowerCase(Locale.ROOT));
                }
                if (setter != null && setter.getClass().getSimpleName().equals("DoubleSetter")) {
                    rule.put("special",privateField(setter,"specialString"));rule.put("separator",privateField(setter,"separator"));
                }
                result.put(key.substring(prefix.length()),rule);
            }
        }
        return result;
    }
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
            row.put("fields",fields(type));row.put("parents",compatible);row.put("body",component instanceof BodyComponent);rows.put(tag,row);
        }
        Files.writeString(Path.of(args[0]),new Gson().toJson(rows)+"\n");
        List<Object> materials = new ArrayList<>();
        for (var database : List.of(info.openrocket.core.database.Databases.BULK_MATERIAL, info.openrocket.core.database.Databases.SURFACE_MATERIAL, info.openrocket.core.database.Databases.LINE_MATERIAL)) {
            for (var material : database) if (!material.isUserDefined()) materials.add(Map.of(
                "name",Application.getTranslator().getBaseText("material",material.getName()),
                "type",material.getType().name().toLowerCase(Locale.ROOT), "density",material.getDensity(),
                "shearModulus",material.getInPlaneShearModulus(), "group",material.getGroup().getDatabaseString()));
        }
        Files.writeString(Path.of(args[0]).resolveSibling("materials.json"),new Gson().toJson(materials)+"\n");
        System.out.println("Exported " + rows.size() + " native component defaults and compatibility rules");
    }
}
