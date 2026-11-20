import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import com.google.gson.*;
import info.openrocket.core.database.motor.ThrustCurveMotorSQLiteDatabase;
import info.openrocket.core.file.motor.RockSimMotorWriter;
import info.openrocket.core.motor.Motor;
import info.openrocket.core.motor.MotorDigest;
import info.openrocket.core.database.motor.ThrustCurveMotorSetDatabase;
import info.openrocket.core.utils.MotorCorrelation;

/** Build-time browser catalog from the same bundled SQLite database used by desktop. */
public class MotorCatalogExporter {
    public static void main(String[] args) throws Exception {
        Path source=Path.of(args[0]), index=Path.of(args[1]), curves=Path.of(args[2]);
        Files.createDirectories(index.getParent());Files.createDirectories(curves);
        List<Map<String,Object>> rows=new ArrayList<>();
        var all=ThrustCurveMotorSQLiteDatabase.readDatabase(source.toFile());
        var database=new ThrustCurveMotorSetDatabase();for(var motor:all)database.addMotor(motor);
        var sets=database.getMotorSets();var groups=new ArrayList<Integer>();
        for(var motor:all) {
            String digest=motor.getDigest(), rse=new RockSimMotorWriter().write(motor), sha=hash(rse.getBytes(StandardCharsets.UTF_8));
            Files.writeString(curves.resolve(sha+".rse"),rse,StandardCharsets.UTF_8);
            Map<String,Object> row=new LinkedHashMap<>();
            row.put("key",digest+"-"+rows.size());row.put("digest",digest);row.put("sha256",sha);row.put("functionalDigest",MotorDigest.digestMotor(motor));
            row.put("manufacturer",motor.getManufacturer().getSimpleName());row.put("manufacturerNames",motor.getManufacturer().getAllNames().stream().map(n->n.toLowerCase(Locale.ROOT).replaceAll("[^a-zA-Z0-9]+"," ").trim()).sorted().toList());row.put("designation",motor.getDesignation());row.put("commonName",motor.getCommonName());
            row.put("type",motor.getMotorType().name().toLowerCase(Locale.ROOT));row.put("diameter",motor.getDiameter());row.put("length",motor.getLength());
            row.put("caseInfo",motor.getCaseInfo());row.put("impulse",motor.getTotalImpulseEstimate());row.put("burnTime",motor.getBurnTimeEstimate());
            row.put("delays",Arrays.stream(motor.getStandardDelays()).mapToObj(d->d==Motor.PLUGGED_DELAY?"none":Double.toString(d)).toList());
            int group=0;while(!sets.get(group).matches(motor))group++;
            groups.add(group);row.put("group",group);row.put("filterImpulse",sets.get(group).getTotalImpulse());row.put("available",sets.get(group).isAvailable());
            rows.add(row);
        }
        for(int i=0;i<all.size();i++) {
            List<String> similar=new ArrayList<>();
            for(int j=0;j<all.size();j++)if(i!=j && groups.get(i).equals(groups.get(j)) && MotorCorrelation.similarity(all.get(i),all.get(j))>=0.95)similar.add((String)rows.get(j).get("key"));
            rows.get(i).put("similar",similar);
        }
        rows.sort(Comparator.comparing((Map<String,Object> r)->(String)r.get("manufacturer")).thenComparing(r->(String)r.get("designation")).thenComparing(r->(String)r.get("digest")));
        Map<String,Object> result=new LinkedHashMap<>();result.put("sourceSha256",hash(Files.readAllBytes(source)));result.put("motors",rows);
        Files.writeString(index,new GsonBuilder().disableHtmlEscaping().create().toJson(result)+"\n",StandardCharsets.UTF_8);
        System.out.println("Exported "+rows.size()+" desktop motor curves");
    }
    static String hash(byte[] bytes)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
}
