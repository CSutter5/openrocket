import java.io.File;
import java.nio.file.*;
import java.util.*;
import com.google.gson.*;
import info.openrocket.core.file.*;
import info.openrocket.core.rocketcomponent.*;
import proof.EditorStability;

/** Native creation and stability oracle using actual desktop-loaded archives. */
public class ComponentDesktopProof {
    static void setProperty(RocketComponent component, String name, String value, java.util.HashMap<String,String> attrs) throws Exception {
        var config=Class.forName("info.openrocket.core.file.openrocket.importt.DocumentConfig");
        var field=config.getDeclaredField("setters");field.setAccessible(true);var setters=(Map<?,?>)field.get(null);
        Object setter=null;for(Class<?> type=component.getClass();type!=null;type=type.getSuperclass())if(setters.containsKey(type.getSimpleName()+":"+name)){setter=setters.get(type.getSimpleName()+":"+name);break;}
        if(setter==null)throw new IllegalArgumentException("Native setter missing: "+name);
        var method=setter.getClass().getMethod("set",RocketComponent.class,String.class,java.util.HashMap.class,info.openrocket.core.logging.WarningSet.class);method.setAccessible(true);
        var warnings=new info.openrocket.core.logging.WarningSet();method.invoke(setter,component,value,attrs,warnings);
        if(!warnings.isEmpty())throw new AssertionError("Native setter refused: "+warnings);
    }
    static byte[] comparable(byte[] xml, Set<String> removed, String removedId) {
        String text=new String(xml,java.nio.charset.StandardCharsets.UTF_8);
        for(String id:removed)text=text.replace("source=\""+id+"\"","source=\""+removedId+"\"").replace("<source>"+id+"</source>","<source>"+removedId+"</source>");
        if(!removed.isEmpty())text=java.util.regex.Pattern.compile("(?s)<warning\\b[^>]*>.*?</warning>").matcher(text).replaceAll(match -> {
            String warning=match.group();
            if(warning.contains("<source>"+removedId+"</source>"))warning=warning.replaceFirst("(?s)(</[^>]+>)[^<>]*(</warning>)$","$1$2");
            return java.util.regex.Matcher.quoteReplacement(warning);
        });
        if(!removed.isEmpty())text=text.replaceAll("(?s)\\s*<docprefs>.*?</docprefs>","");
        return text.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }
    public static void main(String[] args) throws Exception {
        ImportedEffectsDesktopProof.setup();
        var original = new GeneralRocketLoader(new File(args[1])).load();
        if (args[0].equals("generate-tree")) {
            var stage = new AxialStage();stage.setName("Second stage");original.getRocket().addChild(stage);
            var tube = new BodyTube();tube.setName("Second stage tube");tube.setOuterRadiusAutomatic(false);stage.addChild(tube);
            int index=0;for(var config:original.getRocket().getFlightConfigurations()){
                config._setStageActive(0,index%2==0,false);config._setStageActive(1,index%2!=0,false);index++;
            }
            new GeneralRocketSaver().save(new File(args[2]),original,ArchiveDesktopProof.options());return;
        }
        if (args[0].equals("stability")) {
            if (!args[2].equals("default")) original.getRocket().setSelectedConfiguration(new FlightConfigurationId(args[2]));
            Files.writeString(Path.of(args[3]), EditorStability.snapshot(original.getRocket().getSelectedConfiguration()));return;
        }
        var edited = new GeneralRocketLoader(new File(args[2])).load();
        if (args[0].equals("tree") || args[0].equals("property") || args[0].equals("dialog") || args[0].equals("motor-mount")) {
            var component = original.getRocket().findComponent(UUID.fromString(args[3]));
            Path directory;Set<String> removed = new HashSet<>();
            if (args[0].equals("tree")) {
                var parent = component.getParent();int index = parent.getChildPosition(component);
                switch (args[4]) {
                    case "up": parent.moveChild(component,index-1);break;
                    case "down": parent.moveChild(component,index+1);break;
                    case "delete": for(var descendant:component)removed.add(descendant.getID().toString());parent.removeChild(component);break;
                    case "duplicate": {
                        var copy = component.copy();
                        var actualCopy = edited.getRocket().findComponent(UUID.fromString(args[5]));
                        var expectedIterator = copy.iterator(true);var actualIterator = actualCopy.iterator(true);
                        while (expectedIterator.hasNext()) expectedIterator.next().setID(actualIterator.next().getID());
                        if (actualIterator.hasNext()) throw new AssertionError("Duplicate subtree differs");
                        parent.addChild(copy);break;
                    }
                    default: throw new IllegalArgumentException("Unknown tree operation");
                }
                directory=Path.of(args[6]);
            } else if (args[0].equals("motor-mount")) {
                var settings=JsonParser.parseString(Files.readString(Path.of(args[4]))).getAsJsonObject();
                var mount=(MotorMount)component;
                mount.setMotorMount(settings.get("enabled").getAsBoolean());
                if(settings.get("enabled").getAsBoolean()) {
                    mount.setMotorOverhang(settings.get("overhang").getAsDouble());
                    mount.getDefaultMotorConfig().setIgnitionEvent(info.openrocket.core.motor.IgnitionEvent.valueOf(settings.get("ignitionEvent").getAsString().toUpperCase(java.util.Locale.ROOT).replace("EJECTIONCHARGE","EJECTION_CHARGE")));
                    mount.getDefaultMotorConfig().setIgnitionDelay(settings.get("ignitionDelay").getAsDouble());
                }
                directory=Path.of(args[5]);
            } else if (args[0].equals("dialog")) {
                var changes=JsonParser.parseString(Files.readString(Path.of(args[4]))).getAsJsonObject();
                if(changes.has("name"))component.setName(changes.get("name").getAsString());
                for(var entry:changes.getAsJsonArray("changes")) {
                    var change=entry.getAsJsonObject();String name=change.get("name").getAsString();
                    String value=change.has("value")?change.get("value").getAsString():"";
                    if(change.has("lengthUnit"))value=Double.toString(info.openrocket.core.unit.UnitGroup.UNITS_ALL_LENGTHS.getUnit(change.get("lengthUnit").getAsString()).fromUnit(Double.parseDouble(value))/(change.has("diameter")?2:1));
                    if(change.has("remove") && change.get("remove").getAsBoolean()) {
                        switch(name) {
                            case "overridemass":component.setMassOverridden(false);break;
                            case "overridecg":component.setCGOverridden(false);break;
                            case "overridecd":component.setCDOverridden(false);break;
                            default:throw new IllegalArgumentException("Unexpected removed field: "+name);
                        }
                    } else if(change.has("method") && change.get("method").getAsString().equals("innerRadius")) {
                        ((BodyTube)component).setInnerRadius(Double.parseDouble(value));
                    } else if(change.has("method") && change.get("method").getAsString().equals("sweepAngle")) {
                        ((TrapezoidFinSet)component).setSweepAngle(Double.parseDouble(value));
                    } else {
                        var attrs=new java.util.HashMap<String,String>();
                        if(change.has("attributes"))for(var attr:change.getAsJsonObject("attributes").entrySet())attrs.put(attr.getKey(),attr.getValue().getAsString());
                        setProperty(component,name,value,attrs);
                    }
                }
                directory=Path.of(args[5]);
            } else {
                String name=args[4];var attrs=new java.util.HashMap<String,String>();
                var json=JsonParser.parseString(args[6]).getAsJsonObject();for(var entry:json.entrySet())attrs.put(entry.getKey(),entry.getValue().getAsString());
                setProperty(component,name,args[5],attrs);
                directory=Path.of(args[7]);
            }
            Files.createDirectories(directory);
            var expectedDocument = original;
            if (!removed.isEmpty()) {
                var nativeSaved=directory.resolve("native-deleted.ork");
                new GeneralRocketSaver().save(nativeSaved.toFile(),original,ArchiveDesktopProof.options());
                expectedDocument=new GeneralRocketLoader(nativeSaved.toFile()).load();
            }
            ArchiveDesktopProof.requireSameXml(comparable(ArchiveDesktopProof.semanticXml(expectedDocument),removed,((RocketComponent)RocketComponent.REMOVED).getID().toString()),comparable(ArchiveDesktopProof.semanticXml(edited),removed,((RocketComponent)RocketComponent.REMOVED).getID().toString()),"Native edit differs",directory);
            ArchiveDesktopProof.requireSameMotorCurves(expectedDocument,edited);
            var saved=directory.resolve("desktop-resaved.ork");new GeneralRocketSaver().save(saved.toFile(),edited,ArchiveDesktopProof.options());
            var reloaded=new GeneralRocketLoader(saved.toFile()).load();
            ArchiveDesktopProof.requireSameXml(comparable(ArchiveDesktopProof.semanticXml(edited),removed,((RocketComponent)RocketComponent.REMOVED).getID().toString()),comparable(ArchiveDesktopProof.semanticXml(reloaded),removed,((RocketComponent)RocketComponent.REMOVED).getID().toString()),"Desktop edit reload differs",directory);
            Files.writeString(directory.resolve("report.json"),new Gson().toJson(Map.of("outcome","passed","nativeDesignEqual",true,"fullSerializationEqual",removed.isEmpty(),"desktopDesignReloadEqual",true,"deletedSourceAndOrphanMaterialNormalization",!removed.isEmpty())));return;
        }
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
