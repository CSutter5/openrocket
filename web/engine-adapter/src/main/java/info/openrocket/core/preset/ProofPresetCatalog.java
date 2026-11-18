package info.openrocket.core.preset;

import info.openrocket.core.material.Material;
import info.openrocket.core.motor.Manufacturer;

/** Two explicit, immutable catalog records for the imported-preset proof, not a catalog service. */
public final class ProofPresetCatalog {
    private ProofPresetCatalog() { }

    public static TypedPropertyMap properties(String key) {
        boolean second = "G1-B".equals(key);
        if (!second && !"G1-A".equals(key)) throw new IllegalArgumentException("Unsupported preset catalog key");
        TypedPropertyMap p = new TypedPropertyMap();
        p.put(ComponentPreset.TYPE, ComponentPreset.Type.BODY_TUBE);
        p.put(ComponentPreset.MANUFACTURER, Manufacturer.getManufacturer("G1 proof"));
        p.put(ComponentPreset.PARTNO, key);
        p.put(ComponentPreset.LENGTH, second ? 0.5 : 0.3);
        p.put(ComponentPreset.OUTER_DIAMETER, second ? 0.08 : 0.06);
        p.put(ComponentPreset.INNER_DIAMETER, second ? 0.076 : 0.058);
        p.put(ComponentPreset.THICKNESS, p.get(ComponentPreset.OUTER_DIAMETER) / 2 - p.get(ComponentPreset.INNER_DIAMETER) / 2);
        p.put(ComponentPreset.MATERIAL, Material.newMaterial(Material.Type.BULK, "G1 explicit bulk", second ? 900 : 680, false));
        return p;
    }

    public static ComponentPreset preset(String key) {
        // Closed-world catalog construction uses the original property/digest code.
        // The desktop generator independently checks this against ComponentPresetFactory.create.
        ComponentPreset preset = new ComponentPreset();
        preset.putAll(properties(key));
        preset.computeDigest();
        return preset;
    }
}
