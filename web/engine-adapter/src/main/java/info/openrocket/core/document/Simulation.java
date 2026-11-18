package info.openrocket.core.document;

import info.openrocket.core.rocketcomponent.FlightConfigurationId;
import info.openrocket.core.rocketcomponent.Rocket;
import info.openrocket.core.simulation.SimulationOptions;

/** Explicit holder for direct event-engine experiments; excludes desktop document/UI lifecycle. */
public final class Simulation {
    private final Rocket rocket;
    private final FlightConfigurationId id;
    private final SimulationOptions options = new SimulationOptions();
    public Simulation(Rocket rocket, FlightConfigurationId id) { this.rocket = rocket; this.id = id; }
    public Rocket getRocket() { return rocket; }
    public FlightConfigurationId getId() { return id; }
    public SimulationOptions getOptions() { return options; }
}
