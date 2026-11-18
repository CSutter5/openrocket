package proof;

import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.util.ModID;

/** Request-local recovery configuration projection. No simulation or imported extension runs here. */
public final class ImportedDeploymentProof {
    private ImportedDeploymentProof() { }

    public static DeploymentConfiguration configuration(String event, double altitude, double delay) {
        if (!Double.isFinite(altitude) || altitude < 0 || altitude > 100000
                || !Double.isFinite(delay) || delay < 0 || delay > 1000) {
            throw new IllegalArgumentException("Deployment parameters outside proof bounds");
        }
        DeploymentConfiguration c = new DeploymentConfiguration();
        c.setDeployEvent(DeploymentConfiguration.DeployEvent.valueOf(event));
        c.setDeployAltitude(altitude);
        c.setDeployDelay(delay);
        return c;
    }

    public static String parameters(DeploymentConfiguration c) {
        return "{\"event\":\"" + c.getDeployEvent().name() + "\",\"altitude\":" + c.getDeployAltitude()
            + ",\"delay\":" + c.getDeployDelay() + ",\"listeners\":" + c.getConfigListeners().size() + "}";
    }

    public static String snapshot(RecoveryDevice device, FlightConfigurationId[] ids) {
        var set = device.getDeploymentConfigurations();
        StringBuilder json = new StringBuilder("{\"default\":").append(parameters(set.getDefault()));
        json.append(",\"overrides\":[");
        boolean comma = false;
        for (var id : set.getIds()) {
            if (comma) json.append(','); comma = true;
            json.append("{\"id\":\"").append(id.key).append("\",\"parameters\":").append(parameters(set.get(id))).append('}');
        }
        json.append("],\"effective\":["); comma = false;
        for (var id : ids) {
            if (comma) json.append(','); comma = true;
            json.append("{\"id\":\"").append(id.key).append("\",\"inherited\":")
                .append(set.get(id) == set.getDefault()).append(",\"parameters\":").append(parameters(set.get(id))).append('}');
        }
        return json.append("]}").toString();
    }

    public static ModID[] modificationIds(Rocket rocket) {
        return new ModID[] { rocket.getModID(), rocket.getMassModID(), rocket.getAerodynamicModID(),
            rocket.getTreeModID(), rocket.getFunctionalModID() };
    }

    public static String modificationChanges(Rocket rocket, ModID[] before) {
        ModID[] after = modificationIds(rocket);
        String[] names = { "document", "mass", "aerodynamic", "tree", "functional" };
        StringBuilder json = new StringBuilder("{");
        for (int i = 0; i < names.length; i++) {
            if (i > 0) json.append(',');
            json.append('"').append(names[i]).append("\":").append(before[i] != after[i]);
        }
        return json.append('}').toString();
    }

    /** Mirrors RecoveryConfigurationPanel.resetDeployment, including its targeted functional event. */
    public static boolean reset(Rocket rocket, RecoveryDevice device, FlightConfigurationId id) {
        var set = device.getDeploymentConfigurations();
        var before = set.get(id).copy(id);
        device.reset(id);
        boolean changed = !before.equals(set.get(id));
        if (changed) rocket.fireComponentChangeEvent(ComponentChangeEvent.AERODYNAMIC_CHANGE, id);
        return changed;
    }

    public static String resetDeployment(String event, double altitude, double delay,
                                          String overrides, String configurations, String selected) {
        String[] keys = configurations.split(";");
        if (keys.length < 1 || keys.length > 16) throw new IllegalArgumentException("Configuration count outside proof bounds");
        Rocket rocket = new Rocket();
        AxialStage stage = new AxialStage(); rocket.addChild(stage);
        BodyTube tube = new BodyTube(); stage.addChild(tube);
        Parachute device = new Parachute(); tube.addChild(device);
        var set = device.getDeploymentConfigurations();
        set.setDefault(configuration(event, altitude, delay));
        FlightConfigurationId[] ids = new FlightConfigurationId[keys.length];
        FlightConfigurationId target = null;
        for (int i = 0; i < keys.length; i++) {
            ids[i] = new FlightConfigurationId(keys[i]);
            if (!ids[i].isValid() || !keys[i].equals(ids[i].key.toString())) throw new IllegalArgumentException("Invalid configuration ID");
            for (int j = 0; j < i; j++) if (ids[i].equals(ids[j])) throw new IllegalArgumentException("Duplicate configuration");
            rocket.createFlightConfiguration(ids[i]);
            if (keys[i].equals(selected)) target = ids[i];
        }
        if (target == null) throw new IllegalArgumentException("Unknown configuration");
        if (!overrides.isEmpty()) for (String row : overrides.split(";")) {
            String[] fields = row.split(",");
            if (fields.length != 4) throw new IllegalArgumentException("Invalid deployment row");
            FlightConfigurationId id = new FlightConfigurationId(fields[0]);
            if (!rocket.containsFlightConfigurationID(id) || set.containsId(id)) throw new IllegalArgumentException("Unknown/duplicate override");
            set.set(id, configuration(fields[1], Double.parseDouble(fields[2]), Double.parseDouble(fields[3])));
        }
        rocket.enableEvents();
        String before = snapshot(device, ids);
        ModID[] mods = new ModID[ids.length];
        for (int i = 0; i < ids.length; i++) mods[i] = rocket.getFlightConfiguration(ids[i]).getModID();
        ModID[] rocketMods = modificationIds(rocket);
        boolean changed = reset(rocket, device, target);
        StringBuilder changes = new StringBuilder("[");
        for (int i = 0; i < ids.length; i++) {
            if (i > 0) changes.append(',');
            changes.append(mods[i] != rocket.getFlightConfiguration(ids[i]).getModID());
        }
        return "{\"before\":" + before + ",\"after\":" + snapshot(device, ids)
            + ",\"functionalChange\":" + changed + ",\"configurationChanged\":" + changes.append(']')
            + ",\"rocketChanged\":" + modificationChanges(rocket, rocketMods) + "}";
    }
}
