/*
 * BodyTubeHandlerTest.java
 */
package info.openrocket.core.file.rocksim.importt;

import info.openrocket.core.logging.WarningSet;
import info.openrocket.core.file.rocksim.RockSimCommonConstants;
import info.openrocket.core.file.simplesax.PlainTextHandler;
import info.openrocket.core.material.Material;
import info.openrocket.core.rocketcomponent.BodyTube;
import info.openrocket.core.rocketcomponent.ExternalComponent;
import info.openrocket.core.rocketcomponent.AxialStage;
import org.junit.Assert;
import org.junit.jupiter.api.Test;

import java.util.HashMap;

/**
 * BodyTubeHandler Tester.
 *
 */
public class BodyTubeHandlerTest extends RockSimTestBase {

    /**
     * Method: constructor
     *
     * @throws Exception thrown if something goes awry
     */
    @Test
    public void testConstructor() throws Exception {

        try {
            new BodyTubeHandler(null, null, new WarningSet());
            Assert.fail("Should have thrown IllegalArgumentException");
        } catch (IllegalArgumentException iae) {
            // success
        }

        AxialStage stage = new AxialStage();
        BodyTubeHandler handler = new BodyTubeHandler(null, stage, new WarningSet());
        BodyTube component = (BodyTube) getField(handler, "bodyTube");
        assertContains(component, stage.getChildren());
    }

    /**
     * Method: openElement(String element, HashMap<String, String> attributes,
     * WarningSet warnings)
     *
     * @throws Exception thrown if something goes awry
     */
    @Test
    public void testOpenElement() throws Exception {
        Assert.assertEquals(PlainTextHandler.INSTANCE,
                new BodyTubeHandler(null, new AxialStage(), new WarningSet()).openElement(null, null, null));
        Assert.assertNotNull(
                new BodyTubeHandler(null, new AxialStage(), new WarningSet()).openElement("AttachedParts", null, null));
    }

    /**
     *
     * Method: closeElement(String element, HashMap<String, String> attributes,
     * String content, WarningSet warnings)
     *
     * @throws Exception thrown if something goes awry
     */
    @Test
    public void testCloseElement() throws Exception {
        AxialStage stage = new AxialStage();
        BodyTubeHandler handler = new BodyTubeHandler(null, stage, new WarningSet());
        BodyTube component = (BodyTube) getField(handler, "bodyTube");
        HashMap<String, String> attributes = new HashMap<String, String>();
        WarningSet warnings = new WarningSet();

        handler.closeElement("OD", attributes, "-1", warnings);
        Assert.assertEquals(0d, component.getInnerRadius(), 0.001);
        handler.closeElement("OD", attributes, "0", warnings);
        Assert.assertEquals(0d, component.getInnerRadius(), 0.001);
        handler.closeElement("OD", attributes, "75", warnings);
        Assert.assertEquals(75d / RockSimCommonConstants.ROCKSIM_TO_OPENROCKET_RADIUS, component.getInnerRadius(),
                0.001);
        handler.closeElement("OD", attributes, "foo", warnings);
        Assert.assertEquals(1, warnings.size());
        warnings.clear();

        handler.closeElement("ID", attributes, "-1", warnings);
        Assert.assertEquals(0d, component.getInnerRadius(), 0.001);
        handler.closeElement("ID", attributes, "0", warnings);
        Assert.assertEquals(0d, component.getInnerRadius(), 0.001);
        handler.closeElement("ID", attributes, "75", warnings);
        Assert.assertEquals(75d / RockSimCommonConstants.ROCKSIM_TO_OPENROCKET_RADIUS, component.getInnerRadius(),
                0.001);
        handler.closeElement("ID", attributes, "foo", warnings);
        Assert.assertEquals(1, warnings.size());
        warnings.clear();

        handler.closeElement("Len", attributes, "-1", warnings);
        Assert.assertEquals(0d, component.getLength(), 0.001);
        handler.closeElement("Len", attributes, "10", warnings);
        Assert.assertEquals(10d / RockSimCommonConstants.ROCKSIM_TO_OPENROCKET_LENGTH, component.getLength(), 0.001);
        handler.closeElement("Len", attributes, "10.0", warnings);
        Assert.assertEquals(10d / RockSimCommonConstants.ROCKSIM_TO_OPENROCKET_LENGTH, component.getLength(), 0.001);
        handler.closeElement("Len", attributes, "foo", warnings);
        Assert.assertEquals(1, warnings.size());
        warnings.clear();

        handler.closeElement("IsMotorMount", attributes, "1", warnings);
        Assert.assertTrue(component.isMotorMount());
        handler.closeElement("IsMotorMount", attributes, "0", warnings);
        Assert.assertFalse(component.isMotorMount());
        handler.closeElement("IsMotorMount", attributes, "foo", warnings);
        Assert.assertFalse(component.isMotorMount());

        handler.closeElement("EngineOverhang", attributes, "-1", warnings);
        Assert.assertEquals(-1d / RockSimCommonConstants.ROCKSIM_TO_OPENROCKET_LENGTH, component.getMotorOverhang(),
                0.001);
        handler.closeElement("EngineOverhang", attributes, "10", warnings);
        Assert.assertEquals(10d / RockSimCommonConstants.ROCKSIM_TO_OPENROCKET_LENGTH, component.getMotorOverhang(),
                0.001);
        handler.closeElement("EngineOverhang", attributes, "10.0", warnings);
        Assert.assertEquals(10d / RockSimCommonConstants.ROCKSIM_TO_OPENROCKET_LENGTH, component.getMotorOverhang(),
                0.001);
        handler.closeElement("EngineOverhang", attributes, "foo", warnings);
        Assert.assertEquals(1, warnings.size());
        warnings.clear();

        handler.closeElement("FinishCode", attributes, "-1", warnings);
        Assert.assertEquals(ExternalComponent.Finish.NORMAL, component.getFinish());
        handler.closeElement("FinishCode", attributes, "100", warnings);
        Assert.assertEquals(ExternalComponent.Finish.NORMAL, component.getFinish());
        handler.closeElement("FinishCode", attributes, "foo", warnings);
        Assert.assertEquals(1, warnings.size());
        warnings.clear();

        handler.closeElement("Name", attributes, "Test Name", warnings);
        Assert.assertEquals("Test Name", component.getName());
    }

    /**
     * Method: getComponent()
     *
     * @throws Exception thrown if something goes awry
     */
    @Test
    public void testGetComponent() throws Exception {
        Assert.assertTrue(
                new BodyTubeHandler(null, new AxialStage(), new WarningSet()).getComponent() instanceof BodyTube);
    }

    /**
     * Method: getMaterialType()
     *
     * @throws Exception thrown if something goes awry
     */
    @Test
    public void testGetMaterialType() throws Exception {
        Assert.assertEquals(Material.Type.BULK,
                new BodyTubeHandler(null, new AxialStage(), new WarningSet()).getMaterialType());
    }

}
