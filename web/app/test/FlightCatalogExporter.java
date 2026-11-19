import java.io.File;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import com.google.gson.*;
import info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase;
import info.openrocket.core.file.motor.RockSimMotorWriter;
import info.openrocket.core.motor.MotorDigest;

/** Two exact public pinned-catalog references; never generated from a user's archive. */
public class FlightCatalogExporter {
    public static void main(String[] args)throws Exception {
        info.openrocket.core.file.openrocket.OpenRocketSaverTest.setup();
        Set<String> required=Set.of("acee08976425e0ddc8b9bfc014a91770","812abf1e0e2e60f6ec54538ffbf2b8e4");
        Map<String,Object> motors=new TreeMap<>();
        for(var motor:ThrustCurveMotorSQLiteDatabase.readDatabase(new File(args[0])))if(required.contains(motor.getDigest())) {
            var json=new LinkedHashMap<String,Object>();String rse=new RockSimMotorWriter().write(motor);
            json.put("sha256",hex(MessageDigest.getInstance("SHA-256").digest(rse.getBytes(java.nio.charset.StandardCharsets.UTF_8))));json.put("rse",rse);json.put("functionalDigest",MotorDigest.digestMotor(motor));
            motors.put(motor.getDigest(),json);
        }
        if(motors.size()!=required.size())throw new AssertionError("Missing exact pinned motor references");
        var result=new LinkedHashMap<String,Object>();result.put("sourceSha256",hex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(Path.of(args[0])))));result.put("motors",motors);
        Files.writeString(Path.of(args[1]),new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create().toJson(result)+"\n");
    }
    static String hex(byte[] bytes){return java.util.HexFormat.of().formatHex(bytes);}
}
