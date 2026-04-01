// src/data/usda/usdaIncomeLimits.js
// 2024–2025 USDA Guaranteed Loan Income Limits
// Source: rd.usda.gov — verify annually at https://www.rd.usda.gov/resources/regulations-guidelines/income-limits
// Format: { STATE: { DEFAULT: [1-4 person, 5-8 person], COUNTY: [1-4, 5-8] } }
// DEFAULT = national baseline applied to all counties not specifically listed
// County names are lowercase for case-insensitive matching — strip " County" suffix before lookup

export const NATIONAL_BASELINE = [110650, 146050];

export const USDA_INCOME_LIMITS = {

  // ── ALABAMA ───────────────────────────────────────────────────────────────
  AL: {
    DEFAULT: [110650, 146050],
    "madison": [127200, 167900],
    "limestone": [127200, 167900],
  },

  // ── ALASKA ────────────────────────────────────────────────────────────────
  AK: {
    DEFAULT: [138350, 182600],
    "anchorage": [158400, 209100],
    "matanuska-susitna": [158400, 209100],
    "fairbanks north star": [147550, 194800],
    "kenai peninsula": [138350, 182600],
    "juneau": [158400, 209100],
  },

  // ── ARIZONA ───────────────────────────────────────────────────────────────
  AZ: {
    DEFAULT: [110650, 146050],
    "maricopa": [117200, 154700],
    "pinal": [117200, 154700],
    "coconino": [113750, 150150],
    "yavapai": [110650, 146050],
  },

  // ── ARKANSAS ──────────────────────────────────────────────────────────────
  AR: {
    DEFAULT: [110650, 146050],
    "benton": [118200, 156000],
    "washington": [118200, 156000],
  },

  // ── CALIFORNIA ────────────────────────────────────────────────────────────
  CA: {
    DEFAULT: [127400, 168150],
    "alameda": [188100, 248300],
    "contra costa": [188100, 248300],
    "marin": [228600, 301850],
    "napa": [165600, 218650],
    "san francisco": [228600, 301850],
    "san mateo": [228600, 301850],
    "santa clara": [212000, 279850],
    "santa cruz": [175000, 231000],
    "sonoma": [155000, 204600],
    "los angeles": [139100, 183600],
    "orange": [156150, 206150],
    "san diego": [144050, 190150],
    "ventura": [152450, 201250],
    "monterey": [133350, 176000],
    "santa barbara": [127400, 168150],
    "san luis obispo": [127400, 168150],
    "sacramento": [115500, 152450],
    "el dorado": [126400, 166900],
    "placer": [126400, 166900],
    "yolo": [121950, 161000],
    "fresno": [110650, 146050],
    "kern": [110650, 146050],
    "riverside": [110650, 146050],
    "san bernardino": [110650, 146050],
    "stanislaus": [110650, 146050],
    "tulare": [110650, 146050],
  },

  // ── COLORADO ──────────────────────────────────────────────────────────────
  CO: {
    DEFAULT: [110650, 146050],
    "denver": [138350, 182600],
    "jefferson": [138350, 182600],
    "arapahoe": [138350, 182600],
    "adams": [138350, 182600],
    "douglas": [138350, 182600],
    "broomfield": [138350, 182600],
    "boulder": [163000, 215100],
    "eagle": [172800, 228250],
    "pitkin": [172800, 228250],
    "summit": [161800, 213600],
    "routt": [145700, 192350],
    "san miguel": [161800, 213600],
    "elbert": [138350, 182600],
    "clear creek": [138350, 182600],
    "gilpin": [138350, 182600],
    "park": [138350, 182600],
    "teller": [117200, 154700],
    "el paso": [113750, 150150],
    "larimer": [123050, 162450],
    "weld": [116400, 153650],
  },

  // ── CONNECTICUT ───────────────────────────────────────────────────────────
  CT: {
    DEFAULT: [130000, 171600],
    "fairfield": [173700, 229300],
    "hartford": [130000, 171600],
    "new haven": [130000, 171600],
    "litchfield": [130000, 171600],
    "middlesex": [130000, 171600],
    "tolland": [130000, 171600],
    "windham": [110650, 146050],
    "new london": [110650, 146050],
  },

  // ── DELAWARE ──────────────────────────────────────────────────────────────
  DE: {
    DEFAULT: [110650, 146050],
    "new castle": [127200, 167900],
    "kent": [110650, 146050],
    "sussex": [110650, 146050],
  },

  // ── FLORIDA ───────────────────────────────────────────────────────────────
  FL: {
    DEFAULT: [110650, 146050],
    "miami-dade": [121550, 160450],
    "broward": [121550, 160450],
    "palm beach": [121550, 160450],
    "monroe": [162550, 214600],
    "collier": [131450, 173500],
    "st. johns": [120100, 158550],
    "duval": [120100, 158550],
    "clay": [120100, 158550],
    "nassau": [120100, 158550],
    "baker": [120100, 158550],
    "orange": [113750, 150150],
    "osceola": [113750, 150150],
    "seminole": [113750, 150150],
    "lake": [113750, 150150],
    "hillsborough": [113750, 150150],
    "pinellas": [113750, 150150],
    "pasco": [113750, 150150],
    "hernando": [113750, 150150],
    "sarasota": [117200, 154700],
    "manatee": [117200, 154700],
    "leon": [110650, 146050],
  },

  // ── GEORGIA ───────────────────────────────────────────────────────────────
  GA: {
    DEFAULT: [110650, 146050],
    "fulton": [127950, 168950],
    "dekalb": [127950, 168950],
    "gwinnett": [127950, 168950],
    "cobb": [127950, 168950],
    "clayton": [127950, 168950],
    "cherokee": [127950, 168950],
    "forsyth": [127950, 168950],
    "henry": [127950, 168950],
    "rockdale": [127950, 168950],
    "newton": [127950, 168950],
    "paulding": [127950, 168950],
    "douglas": [127950, 168950],
    "fayette": [127950, 168950],
    "coweta": [127950, 168950],
    "spalding": [127950, 168950],
    "barrow": [127950, 168950],
    "hall": [114600, 151300],
    "lowndes": [110650, 146050],
    "richmond": [110650, 146050],
    "bibb": [110650, 146050],
    "chatham": [110650, 146050],
    "muscogee": [110650, 146050],
    "clarke": [110650, 146050],
    "columbia": [114600, 151300],
    "richmond": [114600, 151300],
  },

  // ── HAWAII ────────────────────────────────────────────────────────────────
  HI: {
    DEFAULT: [183050, 241650],
    "honolulu": [183050, 241650],
    "maui": [183050, 241650],
    "hawaii": [138700, 183100],
    "kauai": [183050, 241650],
    "kalawao": [183050, 241650],
  },

  // ── IDAHO ─────────────────────────────────────────────────────────────────
  ID: {
    DEFAULT: [110650, 146050],
    "ada": [118200, 156000],
    "canyon": [118200, 156000],
    "blaine": [132100, 174400],
    "teton": [132100, 174400],
    "kootenai": [110650, 146050],
  },

  // ── ILLINOIS ──────────────────────────────────────────────────────────────
  IL: {
    DEFAULT: [110650, 146050],
    "cook": [133550, 176300],
    "dupage": [133550, 176300],
    "lake": [133550, 176300],
    "will": [133550, 176300],
    "kane": [133550, 176300],
    "mchenry": [133550, 176300],
    "kendall": [133550, 176300],
    "grundy": [133550, 176300],
    "dekalb": [122300, 161450],
    "champaign": [110650, 146050],
    "sangamon": [110650, 146050],
    "peoria": [110650, 146050],
    "winnebago": [110650, 146050],
    "st. clair": [110650, 146050],
    "madison": [110650, 146050],
  },

  // ── INDIANA ───────────────────────────────────────────────────────────────
  IN: {
    DEFAULT: [110650, 146050],
    "hamilton": [121950, 161000],
    "hendricks": [121950, 161000],
    "boone": [121950, 161000],
    "marion": [121950, 161000],
    "johnson": [121950, 161000],
    "morgan": [121950, 161000],
    "hancock": [121950, 161000],
    "shelby": [121950, 161000],
    "madison": [121950, 161000],
  },

  // ── IOWA ──────────────────────────────────────────────────────────────────
  IA: {
    DEFAULT: [110650, 146050],
    "johnson": [122300, 161450],
    "linn": [110650, 146050],
    "polk": [110650, 146050],
    "scott": [110650, 146050],
    "black hawk": [110650, 146050],
  },

  // ── KANSAS ────────────────────────────────────────────────────────────────
  KS: {
    DEFAULT: [110650, 146050],
    "johnson": [133550, 176300],
    "wyandotte": [133550, 176300],
    "leavenworth": [133550, 176300],
    "miami": [133550, 176300],
  },

  // ── KENTUCKY ──────────────────────────────────────────────────────────────
  KY: {
    DEFAULT: [110650, 146050],
    "fayette": [110650, 146050],
    "jefferson": [110650, 146050],
    "boone": [121950, 161000],
    "kenton": [121950, 161000],
    "campbell": [121950, 161000],
    "grant": [121950, 161000],
    "gallatin": [121950, 161000],
    "pendleton": [121950, 161000],
  },

  // ── LOUISIANA ─────────────────────────────────────────────────────────────
  LA: {
    DEFAULT: [110650, 146050],
    "st. tammany": [110650, 146050],
    "jefferson": [110650, 146050],
    "east baton rouge": [110650, 146050],
    "orleans": [110650, 146050],
    "lafayette": [110650, 146050],
  },

  // ── MAINE ─────────────────────────────────────────────────────────────────
  ME: {
    DEFAULT: [110650, 146050],
    "cumberland": [117200, 154700],
    "york": [117200, 154700],
    "sagadahoc": [117200, 154700],
    "androscoggin": [110650, 146050],
    "kennebec": [110650, 146050],
  },

  // ── MARYLAND ──────────────────────────────────────────────────────────────
  MD: {
    DEFAULT: [127200, 167900],
    "montgomery": [189050, 249550],
    "prince george's": [189050, 249550],
    "howard": [189050, 249550],
    "anne arundel": [175600, 231850],
    "calvert": [175600, 231850],
    "charles": [175600, 231850],
    "frederick": [168500, 222450],
    "baltimore": [151150, 199500],
    "baltimore city": [151150, 199500],
    "harford": [151150, 199500],
    "carroll": [151150, 199500],
    "queen anne's": [175600, 231850],
    "talbot": [117200, 154700],
    "somerset": [110650, 146050],
  },

  // ── MASSACHUSETTS ─────────────────────────────────────────────────────────
  MA: {
    DEFAULT: [130000, 171600],
    "norfolk": [165600, 218650],
    "middlesex": [165600, 218650],
    "suffolk": [165600, 218650],
    "essex": [165600, 218650],
    "plymouth": [165600, 218650],
    "barnstable": [133000, 175600],
    "nantucket": [196700, 259650],
    "dukes": [196700, 259650],
    "hampshire": [122300, 161450],
    "hampden": [110650, 146050],
    "worcester": [128750, 169950],
    "bristol": [118950, 157050],
  },

  // ── MICHIGAN ──────────────────────────────────────────────────────────────
  MI: {
    DEFAULT: [110650, 146050],
    "washtenaw": [128750, 169950],
    "livingston": [123400, 162900],
    "oakland": [123400, 162900],
    "macomb": [123400, 162900],
    "wayne": [123400, 162900],
    "monroe": [123400, 162900],
    "lapeer": [123400, 162900],
    "st. clair": [123400, 162900],
    "kent": [113350, 149650],
    "ottawa": [113350, 149650],
    "ingham": [110650, 146050],
    "kalamazoo": [110650, 146050],
    "grand traverse": [110650, 146050],
  },

  // ── MINNESOTA ─────────────────────────────────────────────────────────────
  MN: {
    DEFAULT: [110650, 146050],
    "hennepin": [133550, 176300],
    "ramsey": [133550, 176300],
    "dakota": [133550, 176300],
    "anoka": [133550, 176300],
    "washington": [133550, 176300],
    "scott": [133550, 176300],
    "carver": [133550, 176300],
    "sherburne": [133550, 176300],
    "wright": [133550, 176300],
    "isanti": [133550, 176300],
    "chisago": [133550, 176300],
    "st. louis": [110650, 146050],
    "stearns": [110650, 146050],
    "olmsted": [117200, 154700],
  },

  // ── MISSISSIPPI ───────────────────────────────────────────────────────────
  MS: {
    DEFAULT: [110650, 146050],
    "rankin": [110650, 146050],
    "madison": [110650, 146050],
    "hinds": [110650, 146050],
    "desoto": [110650, 146050],
    "harrison": [110650, 146050],
    "jackson": [110650, 146050],
  },

  // ── MISSOURI ──────────────────────────────────────────────────────────────
  MO: {
    DEFAULT: [110650, 146050],
    "st. louis city": [117200, 154700],
    "st. louis": [117200, 154700],
    "jefferson": [117200, 154700],
    "st. charles": [117200, 154700],
    "franklin": [117200, 154700],
    "lincoln": [117200, 154700],
    "warren": [117200, 154700],
    "jackson": [117200, 154700],
    "clay": [117200, 154700],
    "cass": [117200, 154700],
    "platte": [117200, 154700],
    "greene": [110650, 146050],
    "boone": [110650, 146050],
  },

  // ── MONTANA ───────────────────────────────────────────────────────────────
  MT: {
    DEFAULT: [110650, 146050],
    "gallatin": [127200, 167900],
    "lewis and clark": [110650, 146050],
    "yellowstone": [110650, 146050],
    "cascade": [110650, 146050],
    "flathead": [110650, 146050],
    "missoula": [110650, 146050],
  },

  // ── NEBRASKA ──────────────────────────────────────────────────────────────
  NE: {
    DEFAULT: [110650, 146050],
    "douglas": [117200, 154700],
    "sarpy": [117200, 154700],
    "washington": [117200, 154700],
    "saunders": [117200, 154700],
    "lancaster": [110650, 146050],
  },

  // ── NEVADA ────────────────────────────────────────────────────────────────
  NV: {
    DEFAULT: [110650, 146050],
    "clark": [110650, 146050],
    "washoe": [117200, 154700],
    "carson city": [110650, 146050],
    "douglas": [117200, 154700],
  },

  // ── NEW HAMPSHIRE ─────────────────────────────────────────────────────────
  NH: {
    DEFAULT: [127200, 167900],
    "rockingham": [155000, 204600],
    "strafford": [155000, 204600],
    "hillsborough": [138350, 182600],
    "merrimack": [127200, 167900],
    "cheshire": [110650, 146050],
    "coos": [110650, 146050],
  },

  // ── NEW JERSEY ────────────────────────────────────────────────────────────
  NJ: {
    DEFAULT: [154950, 204550],
    "sussex": [154950, 204550],
    "hunterdon": [190750, 251800],
    "somerset": [190750, 251800],
    "monmouth": [190750, 251800],
    "ocean": [190750, 251800],
    "morris": [190750, 251800],
    "bergen": [190750, 251800],
    "passaic": [190750, 251800],
    "essex": [190750, 251800],
    "union": [190750, 251800],
    "middlesex": [190750, 251800],
    "mercer": [154950, 204550],
    "burlington": [154950, 204550],
    "camden": [154950, 204550],
    "gloucester": [154950, 204550],
    "salem": [154950, 204550],
    "atlantic": [110650, 146050],
    "cape may": [110650, 146050],
    "cumberland": [110650, 146050],
    "warren": [154950, 204550],
  },

  // ── NEW MEXICO ────────────────────────────────────────────────────────────
  NM: {
    DEFAULT: [110650, 146050],
    "santa fe": [113750, 150150],
    "los alamos": [135350, 178750],
    "bernalillo": [110650, 146050],
    "sandoval": [110650, 146050],
    "valencia": [110650, 146050],
    "torrance": [110650, 146050],
  },

  // ── NEW YORK ──────────────────────────────────────────────────────────────
  NY: {
    DEFAULT: [127200, 167900],
    "new york": [224400, 296200],
    "kings": [224400, 296200],
    "queens": [224400, 296200],
    "bronx": [224400, 296200],
    "richmond": [224400, 296200],
    "nassau": [224400, 296200],
    "suffolk": [224400, 296200],
    "westchester": [224400, 296200],
    "putnam": [224400, 296200],
    "rockland": [224400, 296200],
    "orange": [154950, 204550],
    "dutchess": [154950, 204550],
    "ulster": [127200, 167900],
    "albany": [120100, 158550],
    "saratoga": [120100, 158550],
    "monroe": [117200, 154700],
    "erie": [110650, 146050],
    "onondaga": [110650, 146050],
    "broome": [110650, 146050],
  },

  // ── NORTH CAROLINA ────────────────────────────────────────────────────────
  NC: {
    DEFAULT: [110650, 146050],
    "wake": [127200, 167900],
    "durham": [127200, 167900],
    "orange": [127200, 167900],
    "chatham": [127200, 167900],
    "johnston": [127200, 167900],
    "franklin": [127200, 167900],
    "mecklenburg": [123400, 162900],
    "cabarrus": [123400, 162900],
    "union": [123400, 162900],
    "iredell": [123400, 162900],
    "lincoln": [123400, 162900],
    "rowan": [123400, 162900],
    "gaston": [123400, 162900],
    "guilford": [113750, 150150],
    "forsyth": [113750, 150150],
    "buncombe": [110650, 146050],
    "new hanover": [110650, 146050],
    "cumberland": [110650, 146050],
  },

  // ── NORTH DAKOTA ──────────────────────────────────────────────────────────
  ND: {
    DEFAULT: [110650, 146050],
    "cass": [113750, 150150],
    "burleigh": [110650, 146050],
    "grand forks": [110650, 146050],
    "ward": [110650, 146050],
  },

  // ── OHIO ──────────────────────────────────────────────────────────────────
  OH: {
    DEFAULT: [110650, 146050],
    "delaware": [121950, 161000],
    "licking": [121950, 161000],
    "fairfield": [121950, 161000],
    "franklin": [121950, 161000],
    "pickaway": [121950, 161000],
    "union": [121950, 161000],
    "madison": [121950, 161000],
    "morrow": [121950, 161000],
    "cuyahoga": [117200, 154700],
    "summit": [117200, 154700],
    "medina": [117200, 154700],
    "lake": [117200, 154700],
    "geauga": [117200, 154700],
    "lorain": [117200, 154700],
    "montgomery": [110650, 146050],
    "hamilton": [110650, 146050],
    "butler": [110650, 146050],
    "warren": [110650, 146050],
    "clermont": [110650, 146050],
    "brown": [110650, 146050],
    "stark": [110650, 146050],
    "lucas": [110650, 146050],
    "allen": [110650, 146050],
  },

  // ── OKLAHOMA ──────────────────────────────────────────────────────────────
  OK: {
    DEFAULT: [110650, 146050],
    "oklahoma": [110650, 146050],
    "cleveland": [110650, 146050],
    "canadian": [110650, 146050],
    "logan": [110650, 146050],
    "grady": [110650, 146050],
    "tulsa": [110650, 146050],
    "rogers": [110650, 146050],
    "wagoner": [110650, 146050],
    "cherokee": [110650, 146050],
  },

  // ── OREGON ────────────────────────────────────────────────────────────────
  OR: {
    DEFAULT: [110650, 146050],
    "washington": [127200, 167900],
    "multnomah": [127200, 167900],
    "clackamas": [127200, 167900],
    "columbia": [127200, 167900],
    "yamhill": [127200, 167900],
    "benton": [113750, 150150],
    "linn": [113750, 150150],
    "lane": [110650, 146050],
    "jackson": [110650, 146050],
    "deschutes": [117200, 154700],
    "marion": [110650, 146050],
    "polk": [110650, 146050],
  },

  // ── PENNSYLVANIA ──────────────────────────────────────────────────────────
  PA: {
    DEFAULT: [110650, 146050],
    "montgomery": [154950, 204550],
    "chester": [154950, 204550],
    "delaware": [154950, 204550],
    "bucks": [154950, 204550],
    "philadelphia": [154950, 204550],
    "pike": [154950, 204550],
    "monroe": [154950, 204550],
    "northampton": [127200, 167900],
    "lehigh": [127200, 167900],
    "carbon": [127200, 167900],
    "allegheny": [117200, 154700],
    "butler": [117200, 154700],
    "westmoreland": [117200, 154700],
    "washington": [117200, 154700],
    "lancaster": [117200, 154700],
    "york": [117200, 154700],
    "cumberland": [120100, 158550],
    "dauphin": [120100, 158550],
    "perry": [120100, 158550],
    "adams": [120100, 158550],
    "centre": [110650, 146050],
    "luzerne": [110650, 146050],
    "lackawanna": [110650, 146050],
  },

  // ── RHODE ISLAND ──────────────────────────────────────────────────────────
  RI: {
    DEFAULT: [127200, 167900],
    "providence": [127200, 167900],
    "kent": [127200, 167900],
    "newport": [150000, 198000],
    "washington": [127200, 167900],
    "bristol": [127200, 167900],
  },

  // ── SOUTH CAROLINA ────────────────────────────────────────────────────────
  SC: {
    DEFAULT: [110650, 146050],
    "york": [123400, 162900],
    "chester": [123400, 162900],
    "union": [123400, 162900],
    "beaufort": [127200, 167900],
    "jasper": [127200, 167900],
    "richland": [110650, 146050],
    "lexington": [110650, 146050],
    "dorchester": [110650, 146050],
    "berkeley": [110650, 146050],
    "charleston": [110650, 146050],
    "horry": [110650, 146050],
    "greenville": [110650, 146050],
  },

  // ── SOUTH DAKOTA ──────────────────────────────────────────────────────────
  SD: {
    DEFAULT: [110650, 146050],
    "minnehaha": [110650, 146050],
    "pennington": [110650, 146050],
    "lincoln": [110650, 146050],
    "codington": [110650, 146050],
  },

  // ── TENNESSEE ─────────────────────────────────────────────────────────────
  TN: {
    DEFAULT: [110650, 146050],
    "williamson": [138350, 182600],
    "davidson": [138350, 182600],
    "rutherford": [138350, 182600],
    "wilson": [138350, 182600],
    "sumner": [138350, 182600],
    "robertson": [138350, 182600],
    "cheatham": [138350, 182600],
    "dickson": [138350, 182600],
    "knox": [110650, 146050],
    "blount": [110650, 146050],
    "anderson": [110650, 146050],
    "shelby": [110650, 146050],
    "hamilton": [110650, 146050],
    "sullivan": [110650, 146050],
  },

  // ── TEXAS ─────────────────────────────────────────────────────────────────
  TX: {
    DEFAULT: [110650, 146050],
    "collin": [133550, 176300],
    "dallas": [133550, 176300],
    "denton": [133550, 176300],
    "rockwall": [133550, 176300],
    "tarrant": [133550, 176300],
    "kaufman": [133550, 176300],
    "johnson": [133550, 176300],
    "parker": [133550, 176300],
    "wise": [133550, 176300],
    "hunt": [133550, 176300],
    "travis": [127200, 167900],
    "williamson": [127200, 167900],
    "hays": [127200, 167900],
    "bastrop": [127200, 167900],
    "caldwell": [127200, 167900],
    "harris": [117200, 154700],
    "montgomery": [117200, 154700],
    "fort bend": [117200, 154700],
    "brazoria": [117200, 154700],
    "galveston": [117200, 154700],
    "liberty": [117200, 154700],
    "chambers": [117200, 154700],
    "bexar": [110650, 146050],
    "comal": [110650, 146050],
    "guadalupe": [110650, 146050],
    "medina": [110650, 146050],
    "atascosa": [110650, 146050],
    "el paso": [110650, 146050],
    "nueces": [110650, 146050],
    "webb": [110650, 146050],
    "hidalgo": [110650, 146050],
    "cameron": [110650, 146050],
    "lubbock": [110650, 146050],
    "midland": [110650, 146050],
    "ector": [110650, 146050],
    "tom green": [110650, 146050],
    "potter": [110650, 146050],
    "randall": [110650, 146050],
    "smith": [110650, 146050],
  },

  // ── UTAH ──────────────────────────────────────────────────────────────────
  UT: {
    DEFAULT: [110650, 146050],
    "salt lake": [117200, 154700],
    "utah": [117200, 154700],
    "davis": [117200, 154700],
    "weber": [117200, 154700],
    "tooele": [117200, 154700],
    "morgan": [117200, 154700],
    "summit": [166350, 219600],
    "wasatch": [166350, 219600],
    "grand": [110650, 146050],
    "cache": [110650, 146050],
    "washington": [110650, 146050],
  },

  // ── VERMONT ───────────────────────────────────────────────────────────────
  VT: {
    DEFAULT: [110650, 146050],
    "chittenden": [122300, 161450],
    "grand isle": [122300, 161450],
    "franklin": [122300, 161450],
    "addison": [110650, 146050],
    "windsor": [110650, 146050],
    "windham": [110650, 146050],
    "rutland": [110650, 146050],
    "caledonia": [110650, 146050],
    "lamoille": [110650, 146050],
    "washington": [110650, 146050],
    "orange": [110650, 146050],
    "orleans": [110650, 146050],
    "essex": [110650, 146050],
  },

  // ── VIRGINIA ──────────────────────────────────────────────────────────────
  VA: {
    DEFAULT: [110650, 146050],
    "arlington": [194500, 256850],
    "fairfax": [194500, 256850],
    "fairfax city": [194500, 256850],
    "falls church city": [194500, 256850],
    "loudoun": [194500, 256850],
    "prince william": [194500, 256850],
    "fauquier": [194500, 256850],
    "stafford": [194500, 256850],
    "spotsylvania": [194500, 256850],
    "fredericksburg city": [194500, 256850],
    "manassas city": [194500, 256850],
    "manassas park city": [194500, 256850],
    "clarke": [194500, 256850],
    "warren": [194500, 256850],
    "culpeper": [194500, 256850],
    "alexandria city": [194500, 256850],
    "chesterfield": [127200, 167900],
    "henrico": [127200, 167900],
    "richmond city": [127200, 167900],
    "colonial heights city": [127200, 167900],
    "hopewell city": [127200, 167900],
    "hanover": [127200, 167900],
    "goochland": [127200, 167900],
    "powhatan": [127200, 167900],
    "new kent": [127200, 167900],
    "charles city": [127200, 167900],
    "virginia beach city": [117200, 154700],
    "norfolk city": [117200, 154700],
    "chesapeake city": [117200, 154700],
    "portsmouth city": [117200, 154700],
    "suffolk city": [117200, 154700],
    "isle of wight": [117200, 154700],
    "james city": [127200, 167900],
    "york": [127200, 167900],
    "williamsburg city": [127200, 167900],
    "albemarle": [127200, 167900],
    "charlottesville city": [127200, 167900],
    "roanoke city": [110650, 146050],
    "montgomery": [110650, 146050],
    "harrisonburg city": [110650, 146050],
    "rockingham": [110650, 146050],
  },

  // ── WASHINGTON ────────────────────────────────────────────────────────────
  WA: {
    DEFAULT: [127200, 167900],
    "king": [175000, 231000],
    "snohomish": [175000, 231000],
    "pierce": [175000, 231000],
    "island": [175000, 231000],
    "kitsap": [138350, 182600],
    "mason": [127200, 167900],
    "thurston": [127200, 167900],
    "clark": [127200, 167900],
    "skamania": [127200, 167900],
    "san juan": [144100, 190200],
    "whatcom": [127200, 167900],
    "skagit": [127200, 167900],
    "spokane": [110650, 146050],
    "benton": [110650, 146050],
    "franklin": [110650, 146050],
    "yakima": [110650, 146050],
    "grant": [110650, 146050],
    "okanogan": [110650, 146050],
    "chelan": [110650, 146050],
    "douglas": [110650, 146050],
    "jefferson": [110650, 146050],
    "clallam": [110650, 146050],
  },

  // ── WEST VIRGINIA ─────────────────────────────────────────────────────────
  WV: {
    DEFAULT: [110650, 146050],
    "jefferson": [194500, 256850],
    "berkeley": [194500, 256850],
    "morgan": [194500, 256850],
    "monongalia": [110650, 146050],
    "cabell": [110650, 146050],
    "kanawha": [110650, 146050],
    "wood": [110650, 146050],
  },

  // ── WISCONSIN ─────────────────────────────────────────────────────────────
  WI: {
    DEFAULT: [110650, 146050],
    "dane": [127200, 167900],
    "waukesha": [127200, 167900],
    "washington": [127200, 167900],
    "ozaukee": [127200, 167900],
    "milwaukee": [127200, 167900],
    "kenosha": [127200, 167900],
    "racine": [127200, 167900],
    "walworth": [127200, 167900],
    "st. croix": [127200, 167900],
    "pierce": [127200, 167900],
    "buffalo": [127200, 167900],
    "trempealeau": [127200, 167900],
    "rock": [110650, 146050],
    "brown": [110650, 146050],
    "outagamie": [110650, 146050],
    "winnebago": [110650, 146050],
    "calumet": [110650, 146050],
    "sheboygan": [110650, 146050],
    "marathon": [110650, 146050],
  },

  // ── WYOMING ───────────────────────────────────────────────────────────────
  WY: {
    DEFAULT: [110650, 146050],
    "teton": [172800, 228250],
    "laramie": [110650, 146050],
    "natrona": [110650, 146050],
    "campbell": [110650, 146050],
    "sheridan": [110650, 146050],
  },

  // ── DISTRICT OF COLUMBIA ──────────────────────────────────────────────────
  DC: {
    DEFAULT: [189050, 249550],
  },

  // ── PUERTO RICO ───────────────────────────────────────────────────────────
  PR: {
    DEFAULT: [110650, 146050],
  },

  // ── VIRGIN ISLANDS ────────────────────────────────────────────────────────
  VI: {
    DEFAULT: [110650, 146050],
  },

  // ── GUAM ──────────────────────────────────────────────────────────────────
  GU: {
    DEFAULT: [110650, 146050],
  },
};

/**
 * Look up USDA income limits for a given state and county.
 * @param {string} state - 2-letter state code (e.g. "GA")
 * @param {string} county - County name, with or without "County" suffix
 * @param {number} householdSize - Household size (1–8)
 * @returns {{ limit: number, source: 'county'|'state_default'|'national_baseline' }}
 */
export function getUSDAIncomeLimit(state, county, householdSize = 2) {
  const stateUpper = (state || "").toUpperCase().trim();
  const countyClean = (county || "")
    .toLowerCase()
    .replace(/\s+county$/i, "")
    .replace(/\s+parish$/i, "")
    .trim();
  const isHighHH = householdSize >= 5;

  const stateData = USDA_INCOME_LIMITS[stateUpper];
  if (!stateData) {
    return { limit: NATIONAL_BASELINE[isHighHH ? 1 : 0], source: "national_baseline" };
  }

  // Try exact county match
  if (countyClean && stateData[countyClean]) {
    return { limit: stateData[countyClean][isHighHH ? 1 : 0], source: "county" };
  }

  // Try partial match (e.g. "st. johns" vs "saint johns")
  if (countyClean) {
    const normalized = countyClean.replace(/\./g, "").replace(/saint/g, "st");
    const match = Object.keys(stateData).find(k => {
      const kn = k.replace(/\./g, "").replace(/saint/g, "st");
      return kn === normalized;
    });
    if (match) {
      return { limit: stateData[match][isHighHH ? 1 : 0], source: "county" };
    }
  }

  // Fall back to state default
  if (stateData.DEFAULT) {
    return { limit: stateData.DEFAULT[isHighHH ? 1 : 0], source: "state_default" };
  }

  return { limit: NATIONAL_BASELINE[isHighHH ? 1 : 0], source: "national_baseline" };
}

/**
 * Get both household size brackets for display purposes.
 */
export function getUSDAIncomeLimitBothBrackets(state, county) {
  const stateUpper = (state || "").toUpperCase().trim();
  const countyClean = (county || "").toLowerCase().replace(/\s+county$/i, "").replace(/\s+parish$/i, "").trim();
  const stateData = USDA_INCOME_LIMITS[stateUpper];
  if (!stateData) return { low: NATIONAL_BASELINE[0], high: NATIONAL_BASELINE[1], source: "national_baseline" };

  if (countyClean && stateData[countyClean]) {
    return { low: stateData[countyClean][0], high: stateData[countyClean][1], source: "county" };
  }

  if (countyClean) {
    const normalized = countyClean.replace(/\./g, "").replace(/saint/g, "st");
    const match = Object.keys(stateData).find(k => k.replace(/\./g, "").replace(/saint/g, "st") === normalized);
    if (match) return { low: stateData[match][0], high: stateData[match][1], source: "county" };
  }

  if (stateData.DEFAULT) return { low: stateData.DEFAULT[0], high: stateData.DEFAULT[1], source: "state_default" };
  return { low: NATIONAL_BASELINE[0], high: NATIONAL_BASELINE[1], source: "national_baseline" };
}
