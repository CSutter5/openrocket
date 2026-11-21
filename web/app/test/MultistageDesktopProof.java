import java.awt.geom.Line2D;
import java.awt.geom.Point2D;
import java.nio.file.*;
import java.util.Random;
import proof.PortableLine2D;
import proof.PortablePoint2D;

/** Independent JDK geometry reference, including collinear and degenerate segments. */
public class MultistageDesktopProof {
    public static void main(String[] args) throws Exception {
        Random random=new Random(92836);
        int count=0;
        for(int index=0;index<10000;index++) {
            double[] p=new double[8];
            for(int j=0;j<p.length;j++)p[j]=index<5000?random.nextInt(5)-2:random.nextDouble()*20-10;
            if(index%3==0){p[1]=0;p[3]=0;p[5]=0;p[7]=0;}
            if(index%7==0){p[2]=p[0];p[3]=p[1];}
            var first=new PortableLine2D.Double(new PortablePoint2D.Double(p[0],p[1]),new PortablePoint2D.Double(p[2],p[3]));
            var second=new PortableLine2D.Double(new PortablePoint2D.Double(p[4],p[5]),new PortablePoint2D.Double(p[6],p[7]));
            var expected=new Line2D.Double(new Point2D.Double(p[0],p[1]),new Point2D.Double(p[2],p[3])).intersectsLine(new Line2D.Double(p[4],p[5],p[6],p[7]));
            if(expected!=first.intersectsLine(second))throw new AssertionError("Segment intersection differs from JDK: "+index);
            count++;
        }
        Files.writeString(Path.of(args[0]),"{\"segmentComparisons\":"+count+"}\n");
    }
}
