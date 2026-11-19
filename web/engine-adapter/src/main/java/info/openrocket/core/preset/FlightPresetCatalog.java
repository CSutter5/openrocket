package info.openrocket.core.preset;

import info.openrocket.core.material.Material;
import info.openrocket.core.motor.Manufacturer;

/** One pinned public catalog record, from openrocket-database/orc/top_flight.orc. */
public final class FlightPresetCatalog {
    public static TypedPropertyMap properties() {
        TypedPropertyMap p=new TypedPropertyMap();
        p.put(ComponentPreset.TYPE,ComponentPreset.Type.PARACHUTE);
        p.put(ComponentPreset.MANUFACTURER,Manufacturer.getManufacturer("Top Flight Recovery"));
        p.put(ComponentPreset.PARTNO,"PAR-36");
        p.put(ComponentPreset.DESCRIPTION,"Parachute, 36 in., nylon, 8 lines");
        p.put(ComponentPreset.MATERIAL,Material.newMaterial(Material.Type.SURFACE,"Nylon fabric, ripstop, 1.7 oz actual",0.0527,true));
        p.put(ComponentPreset.DIAMETER,36*0.0254); p.put(ComponentPreset.SIDES,8); p.put(ComponentPreset.LINE_COUNT,8); p.put(ComponentPreset.LINE_LENGTH,36*0.0254);
        p.put(ComponentPreset.LINE_MATERIAL,Material.newMaterial(Material.Type.LINE,"Nylon Paracord, 110 lb, 1/16 in. dia.",0.00160,true));
        return p;
    }
    public static ComponentPreset preset() { ComponentPreset p=new ComponentPreset(); p.putAll(properties()); p.computeDigest(); return p; }
}
