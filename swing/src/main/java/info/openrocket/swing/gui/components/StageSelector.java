package info.openrocket.swing.gui.components;

import java.awt.event.ActionEvent;
import java.util.ArrayList;
import java.util.EventObject;
import java.util.List;

import javax.swing.AbstractAction;
import javax.swing.JPanel;
import javax.swing.JToggleButton;

import net.miginfocom.swing.MigLayout;
import info.openrocket.core.l10n.Translator;
import info.openrocket.core.rocketcomponent.AxialStage;
import info.openrocket.core.rocketcomponent.BodyTube;
import info.openrocket.core.rocketcomponent.ComponentAssembly;
import info.openrocket.core.rocketcomponent.ComponentChangeEvent;
import info.openrocket.core.rocketcomponent.FlightConfiguration;
import info.openrocket.core.rocketcomponent.Rocket;
import info.openrocket.core.rocketcomponent.RocketComponent;
import info.openrocket.core.startup.Application;
import info.openrocket.core.util.StateChangeListener;


@SuppressWarnings("serial")
public class StageSelector extends JPanel implements StateChangeListener {

	private static final Translator trans = Application.getTranslator();
	private final Rocket rocket;
	
	private List<JToggleButton> buttons = new ArrayList<>();
	
	public StageSelector(Rocket _rkt) {
		super(new MigLayout("gap rel!, insets 0"));
		this.rocket = _rkt;
		
		updateButtons( this.rocket.getSelectedConfiguration() );
	}
	
	private void updateButtons( final FlightConfiguration configuration ) {
		buttons.clear();
		this.removeAll();
		List<ComponentAssembly> assemblies = configuration.getRocket().getAllChildAssemblies();

		for (RocketComponent stage : assemblies) {
			if (!(stage instanceof AxialStage)) continue;
			JToggleButton button = new JToggleButton(new StageAction((AxialStage) stage));
			button.setSelected(configuration.isStageActive(stage.getStageNumber()));
			this.add(button);
			buttons.add(button);
		}
		
		this.revalidate();
	}
	
	@Override
	public void stateChanged(EventObject eo) {
		Object source = eo.getSource();
		if ((source instanceof Rocket) || (source instanceof AxialStage) || (source instanceof BodyTube)) {
			Rocket rkt = (Rocket) ((RocketComponent) source).getRoot();
			updateButtons( rkt.getSelectedConfiguration() );
		}
	}
	
	private class StageAction extends AbstractAction {
		private final AxialStage stage;

		public StageAction(final AxialStage stage) {
			this.stage = stage;
			if (this.stage.getChildCount() == 0) {
				putValue(SHORT_DESCRIPTION, trans.get("RocketPanel.btn.Stages.NoChildren.ttip"));
				setEnabled(false);
			} else {
				putValue(SHORT_DESCRIPTION, trans.get("RocketPanel.btn.Stages.Toggle.ttip"));
			}
			updateUI();
		}
		
		@Override
		public Object getValue(String key) {
			if (key.equals(NAME)) {
				// Stage
				return stage.getName();
			}
			return super.getValue(key);
		}
		
		@Override
		public void actionPerformed(ActionEvent e) {
			// Don't toggle the state if the stage has no children (and is therefore inactive)
			if (stage.getChildCount() == 0) {
				putValue(SHORT_DESCRIPTION, trans.get("RocketPanel.btn.Stages.NoChildren.ttip"));
				setEnabled(false);
				return;
			} else {
				setEnabled(true);
				putValue(SHORT_DESCRIPTION, trans.get("RocketPanel.btn.Stages.Toggle.ttip"));
			}
			FlightConfiguration config = rocket.getSelectedConfiguration();
			config.toggleStage(stage.getStageNumber());
			rocket.fireComponentChangeEvent(ComponentChangeEvent.AEROMASS_CHANGE | ComponentChangeEvent.MOTOR_CHANGE,
					config.getFlightConfigurationID());
		}
		
	}
}
