package info.openrocket.core.material;

import info.openrocket.core.l10n.Translator;
import info.openrocket.core.startup.Application;
import info.openrocket.core.unit.Unit;
import info.openrocket.core.unit.UnitGroup;
import info.openrocket.core.util.MathUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A class for different material types.  Each material has a name and density.
 * The interpretation of the density depends on the material type.  For
 * {@link Type#BULK} it is kg/m^3, for {@link Type#SURFACE} km/m^2.
 * <p>
 * Objects of this type are immutable.
 * 
 * @author Sampo Niskanen <sampo.niskanen@iki.fi>
 */

public abstract class Material implements Comparable<Material> {
	private static final Translator trans = Application.getTranslator();
	private static final Logger log = LoggerFactory.getLogger(Material.class);

	public enum Type {
		BULK("Databases.materials.types.Bulk", UnitGroup.UNITS_DENSITY_BULK),
		SURFACE("Databases.materials.types.Surface", UnitGroup.UNITS_DENSITY_SURFACE),
		LINE("Databases.materials.types.Line", UnitGroup.UNITS_DENSITY_LINE),
		CUSTOM("Databases.materials.types.Custom", UnitGroup.UNITS_DENSITY_BULK);
		
		private final String name;
		private final UnitGroup units;
		
		private Type(String nameKey, UnitGroup units) {
			this.name = trans.get(nameKey);
			this.units = units;
		}
		
		public UnitGroup getUnitGroup() {
			return units;
		}
		
		@Override
		public String toString() {
			return name;
		}
	}
	
	
	/////  Definitions of different material types  /////
	
	public static class Line extends Material {
		Line(String name, double density, MaterialGroup group, boolean userDefined) {
			super(name, density, group, userDefined);
		}

		Line(String name, double density, boolean userDefined) {
			super(name, density, userDefined);
		}
		
		@Override
		public Type getType() {
			return Type.LINE;
		}
	}
	
	public static class Surface extends Material {

		Surface(String name, double density, MaterialGroup group, boolean userDefined) {
			super(name, density, group, userDefined);
		}

		Surface(String name, double density, boolean userDefined) {
			super(name, density, userDefined);
		}
		
		@Override
		public Type getType() {
			return Type.SURFACE;
		}
		
		@Override
		public String toStorableString() {
			return super.toStorableString();
		}
	}
	
	public static class Bulk extends Material {
		Bulk(String name, double density, MaterialGroup group, boolean userDefined) {
			super(name, density, group, userDefined);
		}

		Bulk(String name, double density, boolean userDefined) {
			super(name, density, userDefined);
		}
		
		@Override
		public Type getType() {
			return Type.BULK;
		}
	}
	

	public static class Custom extends Material {
		Custom(String name, double density, MaterialGroup group, boolean userDefined) {
			super(name, density, group, userDefined);
		}

		Custom(String name, double density, boolean userDefined) {
			super(name, density, userDefined);
		}
		
		@Override
		public Type getType() {
			return Type.CUSTOM;
		}
	}
	
	
	
	private final String name;
	private final double density;
	private final boolean userDefined;
	private final MaterialGroup group;
	
	
	/**
	 * Constructor for materials.
	 * 
	 * @param name ignored when defining system materials.
	 * @param density: the density of the material.
	 * @param group the material group.
	 * @param userDefined true if this is a user defined material, false if it is a system material.
	 */
	private Material(String name, double density, MaterialGroup group, boolean userDefined) {
		this.name = name;
		this.density = density;
		this.group = group;
		this.userDefined = userDefined;
	}

	private Material(String name, double density, boolean userDefined) {
		this(name, density, null, userDefined);
	}
	
	public double getDensity() {
		return density;
	}
	
	public String getName() {
		return name;
	}
	
	public String getName(Unit u) {
		return name + " (" + u.toStringUnit(density) + ")";
	}
	
	public boolean isUserDefined() {
		return userDefined;
	}
	
	public abstract Type getType();

	public MaterialGroup getGroup() {
		return group;
	}

	public int getGroupPriority() {
		if (group == null) {
			return Integer.MAX_VALUE;
		}
		return group.getPriority();
	}
	
	@Override
	public String toString() {
		return this.getName(this.getType().getUnitGroup().getDefaultUnit());
	}
	
	
	/**
	 * Compares this object to another object.  Material objects are equal if and only if
	 * their types, names and densities are identical.
	 */
	@Override
	public boolean equals(Object o) {
		if (o == null)
			return false;
		if (this.getClass() != o.getClass())
			return false;
		Material m = (Material) o;
		return ((m.name.equals(this.name)) && MathUtil.equals(m.density, this.density)) && groupsEqual(m);
	}

	private boolean groupsEqual(Material m) {
		if (group == null) {
			return m.group == null;
		}
		return group.equals(m.group);
	}
	
	
	/**
	 * A hashCode() method giving a hash code compatible with the equals() method.
	 */
	@Override
	public int hashCode() {
		return name.hashCode() + (int) (density * 1000);
	}
	
	
	/**
	 * Order the materials according to their name, secondarily according to density.
	 */
	@Override
	public int compareTo(Material o) {
		int c = this.name.compareTo(o.name);
		if (c != 0) {
			return c;
		} else {
			return (int) ((this.density - o.density) * 1000);
		}
	}
	
	
	/**
	 * Return a new material.  The name is used as-is, without any translation.
	 * 
	 * @param type			the material type
	 * @param name			the material name
	 * @param density		the material density
	 * @param group			the material group
	 * @param userDefined	whether the material is user-defined or not
	 * @return				the new material
	 */
	public static Material newMaterial(Type type, String name, double density, MaterialGroup group, boolean userDefined) {
		return switch (type) {
			case LINE -> new Line(name, density, group, userDefined);
			case SURFACE -> new Surface(name, density, group, userDefined);
			case BULK -> new Bulk(name, density, group, userDefined);
			case CUSTOM -> new Custom(name, density, group, userDefined);
			default -> throw new IllegalArgumentException("Unknown material type: " + type);
		};
	}

	public static Material newMaterial(Type type, String name, double density, boolean userDefined) {
		return newMaterial(type, name, density, null, userDefined);
	}
	
	public String toStorableString() {
		if (group != null) {
			return getType().name() + "|" + name.replace('|', ' ') + '|' + density + '|' + group.getDatabaseString();
		} else {
			return getType().name() + "|" + name.replace('|', ' ') + '|' + density;
		}
	}
	
	
	/**
	 * Return a material defined by the provided string.
	 * 
	 * @param str			the material storage string, formatted as "{type}|{name}|{density}|{group}".
	 * @param userDefined	whether the created material is user-defined.
	 * @return				a new <code>Material</code> object.
	 * @throws IllegalArgumentException		if <code>str</code> is invalid or null.
	 */
	public static Material fromStorableString(String str, boolean userDefined) {
		if (str == null)
			throw new IllegalArgumentException("Material string is null");
		
		String[] split = str.split("\\|", 4);
		if (split.length < 3)
			throw new IllegalArgumentException("Illegal material string: " + str);
		
		Type type;
		String name;
		double density;
		MaterialGroup group = null;
		
		try {
			type = Type.valueOf(split[0]);
		} catch (Exception e) {
			throw new IllegalArgumentException("Illegal material string: " + str, e);
		}
		
		name = split[1];
		
		try {
			density = Double.parseDouble(split[2]);
		} catch (NumberFormatException e) {
			throw new IllegalArgumentException("Illegal material string: " + str, e);
		}

		if (split.length == 4) {
			try {
				group = MaterialGroup.loadFromDatabaseString(split[3]);
			} catch (IllegalArgumentException e) {
				log.debug(e.toString());
			}
		}

		return switch (type) {
			case BULK -> new Bulk(name, density, group, userDefined);
			case SURFACE -> new Surface(name, density, group, userDefined);
			case LINE -> new Line(name, density, group, userDefined);
			default -> throw new IllegalArgumentException("Illegal material string: " + str);
		};
	}
	
}
