import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import com.google.gson.*;
import info.openrocket.core.file.motor.RockSimMotorLoader;
import info.openrocket.core.motor.MotorDigest;

/** Verify every emitted curve with the actual desktop RSE loader and digest rules. */
public class CatalogCurveProof {
    public static void main(String[] args) throws Exception {
        var catalog=JsonParser.parseString(Files.readString(Path.of(args[0]))).getAsJsonObject();int count=0;
        for(var element:catalog.getAsJsonArray("motors")) {
            var row=element.getAsJsonObject();String sha=row.get("sha256").getAsString();
            byte[] bytes=Files.readAllBytes(Path.of(args[1],sha+".rse"));
            if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).equals(sha))throw new AssertionError("Curve bytes changed");
            var builders=new RockSimMotorLoader().load(new StringReader(new String(bytes,java.nio.charset.StandardCharsets.UTF_8)),"catalog.rse");
            if(builders.size()!=1)throw new AssertionError("Expected one curve");
            var motor=builders.get(0).build();
            if(!MotorDigest.isDigestCompatible(motor,row.get("digest").getAsString()))throw new AssertionError("Desktop motor digest mismatch "+row.get("manufacturer")+" "+row.get("designation")+" "+row.get("key"));
            if(!motor.getMotorType().name().equalsIgnoreCase(row.get("type").getAsString()))throw new AssertionError("Motor type mismatch");
            if(!motor.getDesignation().equals(row.get("designation").getAsString())||Math.abs(motor.getDiameter()-row.get("diameter").getAsDouble())>1e-12||Math.abs(motor.getLength()-row.get("length").getAsDouble())>1e-12)throw new AssertionError("Catalog metadata mismatch");
            count++;
        }
        if(count!=1942)throw new AssertionError("Incomplete desktop catalog");
        System.out.println("All "+count+" catalog curves reopen with matching desktop digests and metadata");
    }
}
