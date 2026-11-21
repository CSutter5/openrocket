import java.nio.file.*;
import java.util.*;
import com.google.gson.Gson;
import info.openrocket.core.simulation.*;
import info.openrocket.core.unit.UnitGroup;
import info.openrocket.core.util.LineStyle;

/** Plot labels and conversions come from the desktop, including affine temperature units. */
public class PlotMetadataExporter {
    public static void export(Path path) throws Exception {
        UnitGroup.setDefaultMetricUnits();
        var types = new ArrayList<Object>();
        for (var type : FlightDataType.ALL_TYPES) {
            var units = new ArrayList<Object>();
            for (var unit : type.getUnitGroup().getUnits()) units.add(Map.of(
                "id", unit.getUnit(), "scale", unit.toUnit(1) - unit.toUnit(0), "offset", unit.toUnit(0)));
            String preference = "";
            for (var field : UnitGroup.class.getFields()) {
                if (field.getName().startsWith("UNITS_") && field.get(null) == type.getUnitGroup()) {
                    preference = field.getName().substring(6);break;
                }
            }
            types.add(Map.of("id", type.getSaveKey(), "name", type.getName(), "group", type.getGroup().toString(),
                "units", units, "defaultUnit", type.getUnitGroup().getDefaultUnit().getUnit(), "preference", preference));
        }
        var events = Arrays.stream(FlightEvent.Type.values()).filter(t -> t != FlightEvent.Type.ALTITUDE)
            .map(t -> Map.of("id", t.name(), "name", t.toString())).toList();
        var styles = Arrays.stream(LineStyle.values()).map(s -> Map.of("id", s.name(), "name", s.toString(),
            "dash", s == LineStyle.SOLID ? "" : Arrays.toString(s.getDashes()).replaceAll("[\\[\\],]", ""))).toList();
        Files.writeString(path, new Gson().toJson(Map.of("types", types, "events", events, "styles", styles)) + "\n");
    }
}
