package proof;

/** Segment intersection API used by native freeform-fin validation on TeaVM. */
public abstract class PortableLine2D {
    public abstract double getX1();
    public abstract double getY1();
    public abstract double getX2();
    public abstract double getY2();

    private static int side(double x1, double y1, double x2, double y2, double px, double py) {
        x2-=x1;y2-=y1;px-=x1;py-=y1;
        double cross=px*y2-py*x2;
        if(cross==0) {
            cross=px*x2+py*y2;
            if(cross>0) { px-=x2;py-=y2;cross=px*x2+py*y2;if(cross<0)cross=0; }
        }
        return cross<0?-1:cross>0?1:0;
    }
    public boolean intersectsLine(PortableLine2D other) {
        return side(getX1(),getY1(),getX2(),getY2(),other.getX1(),other.getY1()) * side(getX1(),getY1(),getX2(),getY2(),other.getX2(),other.getY2())<=0
            && side(other.getX1(),other.getY1(),other.getX2(),other.getY2(),getX1(),getY1()) * side(other.getX1(),other.getY1(),other.getX2(),other.getY2(),getX2(),getY2())<=0;
    }
    public static final class Double extends PortableLine2D {
        private final double x1,y1,x2,y2;
        public Double(PortablePoint2D first, PortablePoint2D second) { x1=first.getX();y1=first.getY();x2=second.getX();y2=second.getY(); }
        public double getX1(){return x1;}
        public double getY1(){return y1;}
        public double getX2(){return x2;}
        public double getY2(){return y2;}
    }
}
