package proof;

import java.util.ArrayList;
import java.util.List;
import info.openrocket.core.rocketcomponent.*;
import info.openrocket.core.util.CoordinateIF;

/** Exterior side projection of one axial stage. No imported code or simulation. */
public final class EditorDrawing {
    private EditorDrawing() { }
    public static String draw(String input) {
        if (input.length() > 32768) throw new IllegalArgumentException("Drawing input too large");
        Rocket rocket = new Rocket(); rocket.enableEvents();
        AxialStage stage = new AxialStage(); rocket.addChild(stage);
        List<RocketComponent> components = new ArrayList<>();
        String[] rows = input.split("\n");
        if (rows.length > 128) throw new IllegalArgumentException("Too many exterior components");
        for (String row : rows) {
            String[] p = row.split(";");
            RocketComponent component;
            switch (p[0]) {
                case "bodytube": {
                    BodyTube tube = new BodyTube(); stage.addChild(tube);
                    tube.setLength(number(p[1], 0, 100)); tube.setOuterRadius(number(p[2], 0, 1));
                    tube.setOuterRadiusAutomatic(Boolean.parseBoolean(p[3]));
                    component = tube; break;
                }
                case "nosecone": {
                    NoseCone nose = new NoseCone(); stage.addChild(nose);
                    nose.setLength(number(p[1], 0, 100)); nose.setShapeType(Transition.Shape.valueOf(p[2]));
                    nose.setShapeParameter(number(p[3], 0, 1)); nose.setAftRadius(number(p[4], 0, 1));
                    nose.setAftRadiusAutomatic(Boolean.parseBoolean(p[5]));
                    component = nose; break;
                }
                case "transition": {
                    Transition transition = new Transition(); stage.addChild(transition);
                    transition.setLength(number(p[1], 0, 100)); transition.setShapeType(Transition.Shape.valueOf(p[2]));
                    transition.setShapeParameter(number(p[3], 0, 1));
                    transition.setForeRadius(number(p[4], 0, 1)); transition.setForeRadiusAutomatic(Boolean.parseBoolean(p[5]));
                    transition.setAftRadius(number(p[6], 0, 1)); transition.setAftRadiusAutomatic(Boolean.parseBoolean(p[7]));
                    transition.setClipped(Boolean.parseBoolean(p[8]));
                    component = transition; break;
                }
                case "trapezoidfinset": {
                    int parent = Integer.parseInt(p[1]);
                    if (parent < 0 || parent >= components.size() || !(components.get(parent) instanceof BodyTube))
                        throw new IllegalArgumentException("Fins require an already defined body tube");
                    TrapezoidFinSet fins = new TrapezoidFinSet(); components.get(parent).addChild(fins);
                    fins.setFinShape(number(p[2], 0, 100), number(p[3], 0, 100), number(p[4], -100, 100), number(p[5], 0, 10), 0.001);
                    int count = Integer.parseInt(p[6]);
                    if (count < 1 || count > 8) throw new IllegalArgumentException("Fin count outside drawing bounds");
                    fins.setFinCount(count); fins.setBaseRotation(number(p[7], -2 * Math.PI, 2 * Math.PI));
                    fins.setAxialMethod(info.openrocket.core.rocketcomponent.position.AxialMethod.valueOf(p[8]));
                    fins.setAxialOffset(number(p[9], -100, 100)); component = fins; break;
                }
                default: throw new IllegalArgumentException("Unsupported exterior component");
            }
            components.add(component);
        }
        return snapshot(components);
    }
    /** The desktop oracle supplies actual loaded components to this serializer. */
    public static String snapshot(List<RocketComponent> components) {
        StringBuilder out = new StringBuilder("{\"polygons\":[");
        double minX = Double.POSITIVE_INFINITY, maxX = Double.NEGATIVE_INFINITY, maxY = 0;
        boolean first = true;
        for (int index = 0; index < components.size(); index++) {
            RocketComponent component = components.get(index);
            List<double[][]> polygons = new ArrayList<>();
            if (component instanceof SymmetricComponent shell) {
                double x = shell.getComponentLocations()[0].getX(), length = shell.getLength();
                double[][] points = new double[130][2];
                for (int i = 0; i <= 64; i++) {
                    double localX = length * i / 64, radius = shell.getRadius(localX);
                    points[i] = new double[]{x + localX, radius}; points[129 - i] = new double[]{x + localX, -radius};
                }
                polygons.add(points);
            } else if (component instanceof TrapezoidFinSet fins) {
                CoordinateIF[] locations = fins.getComponentLocations(), points = fins.getFinPoints();
                double[] angles = fins.getInstanceAngles();
                for (int instance = 0; instance < locations.length; instance++) {
                    double[][] polygon = new double[points.length][2];
                    for (int i = 0; i < points.length; i++) polygon[i] = new double[]{locations[instance].getX() + points[i].getX(),
                        locations[instance].getY() + points[i].getY() * Math.cos(angles[instance])};
                    polygons.add(polygon);
                }
            }
            for (double[][] polygon : polygons) {
                if (!first) out.append(','); first = false;
                out.append("{\"index\":").append(index).append(",\"points\":[");
                for (int i = 0; i < polygon.length; i++) {
                    double x = polygon[i][0], y = polygon[i][1];
                    if (!Double.isFinite(x) || !Double.isFinite(y)) throw new IllegalArgumentException("Non-finite drawing geometry");
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x); maxY = Math.max(maxY, Math.abs(y));
                    if (i > 0) out.append(','); out.append('[').append(x).append(',').append(y).append(']');
                }
                out.append("]}");
            }
        }
        if (first || maxX <= minX) throw new IllegalArgumentException("No supported exterior geometry");
        return out.append("],\"minX\":").append(minX).append(",\"maxX\":").append(maxX).append(",\"radius\":").append(maxY).append('}').toString();
    }
    private static double number(String text, double min, double max) {
        double value = Double.parseDouble(text);
        if (!Double.isFinite(value) || value < min || value > max) throw new IllegalArgumentException("Drawing dimension outside bounds");
        return value;
    }
}
