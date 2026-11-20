package info.openrocket.core.preferences;


import info.openrocket.core.material.Material;
import info.openrocket.core.models.atmosphere.ExtendedISAModel;
import info.openrocket.core.models.wind.PinkNoiseWindModel;
import info.openrocket.core.rocketcomponent.FlightConfiguration;
import info.openrocket.core.rocketcomponent.RocketComponent;
import info.openrocket.core.simulation.RK4SimulationStepper;
import info.openrocket.core.util.GeodeticComputationStrategy;

/**
 * SHIM replacing OpenRocket's 1600-line desktop ApplicationPreferences (which
 * drags the OBJ-export subsystem and java.util.prefs). Exposes only the
 * surface this bounded proof calls. Materials are explicit fixture policy.
 * There is no persisted preference store and no per-request global mutation.
 */
public class ApplicationPreferences {

    /** Native RailButton defaults read the bundled catalog; browser preferences remain immutable. */
    public java.util.Set<Material> getUserMaterials() { return java.util.Set.of(); }
    public void addUserMaterial(Material material) { throw new UnsupportedOperationException("Immutable browser materials"); }
    public void removeUserMaterial(Material material) { throw new UnsupportedOperationException("Immutable browser materials"); }

    /** OpenRocket default: Mach number used for override-CD computations. */
    public double getDefaultMach() {
        return 0.3;
    }

    /** Upstream default: true. */
    public boolean getMotorNameColumn() {
        return true;
    }

    /** Upstream default: FlightConfiguration.DEFAULT_CONFIG_NAME (no stored pref here). */
    public String getDefaultFlightConfigName() {
        return FlightConfiguration.DEFAULT_CONFIG_NAME;
    }

    // ---- Generic accessors: no persisted store in the web engine, so the
    // ---- caller-supplied default IS the value (matches an empty prefs store).

    public double getDouble(String key, double defaultValue) {
        return defaultValue;
    }

    public boolean getBoolean(String key, boolean defaultValue) {
        return defaultValue;
    }

    public String getString(String key, String defaultValue) {
        return defaultValue;
    }

    // ---- Preference key constants (SimulationOptions references these) ----

    public static final String LAUNCH_ROD_LENGTH = "LaunchRodLength";
    public static final String LAUNCH_INTO_WIND = "LaunchIntoWind";
    public static final String LAUNCH_ROD_ANGLE = "LaunchRodAngle";
    public static final String LAUNCH_ROD_DIRECTION = "LaunchRodDirection";
    public static final String WIND_DIRECTION = "WindDirection";

    public double getLaunchRelativeHumidity() { return 0; }
    public info.openrocket.core.models.gravity.GravityModelType getGravityModel() {
        return info.openrocket.core.models.gravity.GravityModelType.WGS;
    }
    public double getConstantGravityValue() { return 9.80665; }
    // SimulationOptions normally persists this UI default. The proof's preferences are immutable.
    public void setSimulationStepperMethodChoice(info.openrocket.core.simulation.SimulationStepperMethod method) { }

    // ---- Launch / simulation defaults (values copied from upstream) ----

    private PinkNoiseWindModel averageWindModel;

    public double getLaunchRodLength() {
        return 1;
    }

    public double getLaunchRodAngle() {
        return 0;
    }

    public double getLaunchRodDirection() {
        return Math.PI / 2;
    }

    public double getLaunchAltitude() {
        return 0;
    }

    public double getLaunchLatitude() {
        return 28.61;
    }

    public double getLaunchLongitude() {
        return -80.60;
    }

    public boolean isISAAtmosphere() {
        return true;
    }

    public double getLaunchTemperature() {
        return ExtendedISAModel.STANDARD_TEMPERATURE;
    }

    public double getLaunchPressure() {
        return ExtendedISAModel.STANDARD_PRESSURE;
    }

    public GeodeticComputationStrategy getGeodeticComputation() {
        return GeodeticComputationStrategy.SPHERICAL;
    }

    public double getTimeStep() {
        return RK4SimulationStepper.RECOMMENDED_TIME_STEP;
    }

    public double getMaxSimulationTime() {
        return RK4SimulationStepper.RECOMMENDED_MAX_TIME;
    }

    public PinkNoiseWindModel getAverageWindModel() {
        if (averageWindModel == null) {
            averageWindModel = new PinkNoiseWindModel();
        }
        return averageWindModel;
    }

    /**
     * Explicit fixture materials only; catalog defaults are outside this proof.
     */
    public Material getDefaultComponentMaterial(
            Class<? extends RocketComponent> componentClass,
            Material.Type type) {
        switch (type) {
            case LINE:
                return Material.newMaterial(type, "Fixture cord", 0.002, false);
            case SURFACE:
                return Material.newMaterial(type, "Fixture cloth", 0.067, false);
            case BULK:
                return Material.newMaterial(type, "Fixture bulk", 680, false);
            default:
                throw new IllegalArgumentException("Unknown material type: " + type);
        }
    }
}
