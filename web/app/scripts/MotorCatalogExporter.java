import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import com.google.gson.*;
import info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase;
import info.openrocket.core.file.motor.RockSimMotorWriter;
import info.openrocket.core.motor.Motor;
import info.openrocket.core.motor.MotorDigest;

/** Build-time browser catalog from the same bundled SQLite database used by desktop. */
public class MotorCatalogExporter {
    public static void main(String[] args) throws Exception {
        Path source=Path.of(args[0]), index=Path.of(args[1]), curves=Path.of(args[2]);
        Files.createDirectories(index.getParent());Files.createDirectories(curves);
        List<Map<String,Object>> rows=new ArrayList<>();
        for(var motor:ThrustCurveMotorSQLiteDatabase.readDatabase(source.toFile())) {
            String digest=motor.getDigest(), rse=new RockSimMotorWriter().write(motor), sha=hash(rse.getBytes(StandardCharsets.UTF_8));
            Files.writeString(curves.resolve(sha+".rse"),rse,StandardCharsets.UTF_8);
            Map<String,Object> row=new LinkedHashMap<>();
            row.put("key",digest+"-"+rows.size());row.put("digest",digest);row.put("sha256",sha);row.put("functionalDigest",MotorDigest.digestMotor(motor));
            row.put("manufacturer",motor.getManufacturer().getSimpleName());row.put("designation",motor.getDesignation());row.put("commonName",motor.getCommonName());
            row.put("type",motor.getMotorType().name().toLowerCase(Locale.ROOT));row.put("diameter",motor.getDiameter());row.put("length",motor.getLength());
            row.put("caseInfo",motor.getCaseInfo());row.put("impulse",motor.getTotalImpulseEstimate());row.put("burnTime",motor.getBurnTimeEstimate());
            row.put("delays",Arrays.stream(motor.getStandardDelays()).mapToObj(d->d==Motor.PLUGGED_DELAY?"none":Double.toString(d)).toList());
            rows.add(row);
        }
        rows.sort(Comparator.comparing((Map<String,Object> r)->(String)r.get("manufacturer")).thenComparing(r->(String)r.get("designation")).thenComparing(r->(String)r.get("digest")));
        Map<String,Object> result=new LinkedHashMap<>();result.put("sourceSha256",hash(Files.readAllBytes(source)));result.put("motors",rows);
        Files.writeString(index,new GsonBuilder().disableHtmlEscaping().create().toJson(result)+"\n",StandardCharsets.UTF_8);
        System.out.println("Exported "+rows.size()+" desktop motor curves");
    }
    static String hash(byte[] bytes)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
}
