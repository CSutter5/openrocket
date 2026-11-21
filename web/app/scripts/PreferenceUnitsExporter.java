import java.nio.file.*;
import java.util.*;
import com.google.gson.Gson;
import info.openrocket.core.unit.UnitGroup;

/** Export desktop unit choices/presets without changing runtime engine preferences. */
public class PreferenceUnitsExporter {
    public static void export(Path path) throws Exception {
        String[] names = { "LENGTH", "MOTOR_DIMENSIONS", "DISTANCE", "VELOCITY", "ACCELERATION", "MASS", "FORCE", "IMPULSE", "INERTIA", "STABILITY", "SECONDARY_STABILITY", "DENSITY_LINE", "DENSITY_SURFACE", "DENSITY_BULK", "ROUGHNESS", "AREA", "ANGLE", "ROLL", "TEMPERATURE", "PRESSURE", "WINDSPEED", "LATITUDE", "LONGITUDE" };
        var rows = new LinkedHashMap<String, Object>();
        UnitGroup.setDefaultMetricUnits();
        for (String name : names) {
            var group = (UnitGroup) UnitGroup.class.getField("UNITS_" + name).get(null);
            var options = new ArrayList<Object>();
            for (var unit : group.getUnits()) options.add(Map.of("id", unit.getUnit(), "factor", unit.getMultiplier()));
            var row = new LinkedHashMap<String, Object>();
            row.put("options", options);row.put("metric", group.getDefaultUnit().getUnit());rows.put(name, row);
        }
        UnitGroup.setDefaultImperialUnits();
        for (String name : names) {
            var group = (UnitGroup) UnitGroup.class.getField("UNITS_" + name).get(null);
            @SuppressWarnings("unchecked") var row = (Map<String, Object>) rows.get(name);
            row.put("imperial", group.getDefaultUnit().getUnit());
        }
        Files.writeString(path, new Gson().toJson(rows) + "\n");
    }
}
