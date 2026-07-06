/**
 * Geographic Labels — Civ VI-style names painted on the Civ VII map.
 *
 * Labels CONTINENTS (engine names), ISLANDS, DESERTS, MOUNTAIN RANGES, TAIGA (tundra), JUNGLE (tropical),
 * and NATURAL WONDERS (engine names). Island/region names are PERIOD-ACCURATE toponyms drawn from the
 * NEAREST civilization's own curated pool (e.g. a range near Rome -> "Zagrus Mountains", near the Inca ->
 * "Antisuyu Jungle"); generic + neutral pools fill any gaps, with de-dup so names don't repeat.
 *
 * Names PERSIST per game and re-flavor organically: a place keeps its name until a *new* civ's heartland
 * reaches it, at which point it may flip to that civ's names (frontier/distant places keep their old names,
 * with a fixed per-place stubbornness). Player-set names (Rename Places panel) are locked and never flip.
 *
 * Toggleable map-decoration layer (checkbox next to "Yields" in the mini-map lens menu).
 */

import LensManager from "/core/ui/lenses/lens-manager.js";

const TAG = "[GeoLabels]";
const LAYER_TYPE = "tmt-geo-labels-layer";
const STORE_KEY = "tmt-geo-labels"; // localStorage: { "<seed>": { custom:{key:name}, auto:{key:{n,c}} } }

// ---- look ---------------------------------------------------------------------------------------
const FONTS = ["TitleFont", "TitleFont-SC", "TitleFont-TC", "TitleFont-JP", "TitleFont-KR"];
const LABEL_ALPHA = 64, LABEL_STROKE = 0, FONT_SCALE = 1.0, FACE_CAMERA = true;
const WONDER_OFFSET = 8, MIN_LABEL_TILES = 3, CONTINENT_MIN_TILES = 80;
const HEARTLAND_RADIUS = 4;   // a new civ only re-flavors places within this many tiles of its territory
const NBSP = String.fromCharCode(0xa0);

// biome/terrain region categories -> name-pool type key + display suffix + min region size
const REGION_CATS = [
  { biome: "BIOME_DESERT", typeKey: "deserts", min: 8 },
  { biome: "BIOME_TUNDRA", typeKey: "taiga", min: 10 },
  { biome: "BIOME_TROPICAL", typeKey: "jungle", min: 8 },
  { mountain: true, typeKey: "mountains", min: 5 },
];

const CIV_NAMES = {
  CIVILIZATION_ROME: {islands:["Sicilia","Sardinia","Corsica","Creta","Cyprus","Rhodus","Melita","Euboea","Lesbos","Delos","Cythera","Ilva","Ebusus","Aegina"], deserts:["Libyca","Marmarica","Gaetulia","Numidia","Arabia","Nubia","Palmyrena","Thebaica","Tripolitana","Cyrenaica","Mauretania"], mountains:["Alpes","Apenninus","Pyrenaei","Taurus","Caucasus","Haemus","Atlas","Carpates","Rhodope","Olympus","Pindus","Ida","Vosegus","Iura","Zagrus"], taiga:["Hercynia","Sarmatia","Scythia","Scandia","Germania","Baltia","Bacenis"], jungle:["India","Taprobane","Aethiopia","Azania","Chryse","Limyrica","Gangetica"]},
  CIVILIZATION_GREECE: {islands:["Kreta","Rhodos","Delos","Naxos","Paros","Samos","Chios","Lesbos","Euboia","Kos","Thera","Kerkyra","Kypros","Melos","Ithaka","Andros"], deserts:["Libye","Marmarike","Arabia","Gedrosia","Karmania","Nabataia"], mountains:["Olympos","Pindos","Parnassos","Taygetos","Ossa","Pelion","Helikon","Kithairon","Oite","Erymanthos","Kyllene","Ida","Athos","Parnon","Rhodope","Haimos"], jungle:["Indike","Aithiopia","Gangaridai"]},
  CIVILIZATION_EGYPT: {islands:["Pharos","Elephantine","Philae","Antirrhodos","Prosopitis","Bigeh","Sehel","Keftiu","Rhodos","Kypros","Thera","Kos","Delos","Samos"], deserts:["Libyca","Arabica","Nubica","Marmarica","Troglodytica","Sinai","Ammonia","Wawat","Tjehenu","Tjemehu"], mountains:["Sinai","Casius","Porphyrites","Claudianus","Smaragdus","Libanus","Hermon","Amanus","Taurus","Atlas"]},
  CIVILIZATION_PERSIA: {islands:["Oaracta","Tylos","Arados","Ikaros","Organa","Ogyris","Nosala","Kypros"], deserts:["Carmania","Gedrosia","Sagartia","Maka","Zranka","Aria","Margiana","Dahistan","Arabia"], mountains:["Zagros","Harburz","Demavand","Bagastana","Orontes","Taurus","Kaukasos","Paropamisos","Niphates","Amanos","Masios","Masis","Parachoathras"], taiga:["Verkana","Armina","Kolchis","Kadousia","Tapuria","Matiene"], jungle:["Hindush","Gandara","Thatagush","Paktyike"]},
  CIVILIZATION_HAN: {islands:["Penglai","Fangzhang","Yingzhou","Daiyu","Yuanjiao","Zhuya","Daner"], deserts:["Liusha","Hanhai","Bailongdui","Juyan"], mountains:["Tai","Hua","Heng","Song","Kunlun","Qilian","Yin","Tian","Congling","Emei","Taihang","Wu","Lu","Min","Yanran","Langjuxu"], taiga:["Beihai","Dingling","Jiankun"], jungle:["Guilin","Cangwu","Yulin","Nanhai","Jiaozhi","Jiuzhen","Rinan","Hepu","Zangke","Yelang","Dian","Ailao","Nanyue"]},
  CIVILIZATION_MAURYA: {islands:["Tamraparni","Lanka","Simhala","Nagadvipa","Narikela","Yavadvipa","Suvarnadvipa"], deserts:["Maru","Marusthali","Marukantara","Jangala","Kaccha"], mountains:["Himavat","Vindhya","Sahya","Malaya","Mahendra","Pariyatra","Riksha","Suktimat","Arbuda","Raivataka","Trikuta","Gandhamadana","Kailasa","Chitrakuta"], jungle:["Dandaka","Naimisha","Kamyaka","Khandava","Dvaita","Vrindavana","Madhuvana","Saravana","Pancavati","Vindhyaranya","Mahavana","Anjanavana"]},
  CIVILIZATION_KHMER: {mountains:["Mahendraparvata","Lingaparvata","Dangrek","Kravanh","Damrei","Kulen","Chisor","Sandak","Bayang","Bakheng","Krom","Bok","Rung","Da","Wan","Aoral"], jungle:["Isanapura","Bhavapura","Vyadhapura","Sambhupura","Hariharalaya","Yasodharapura","Chok Gargyar","Lingapura","Amarendrapura","Aninditapura","Vikramapura","Indrapura","Lavodaya","Bhimapura"]},
  CIVILIZATION_MAYA: {islands:["Cuzamil","Jaina","Topoxte","Zacpeten","Cilvituk"], mountains:["Cuchumatanes","Hunahpu","Gagxanul","Hacauitz","Zunil","Tacana","Tajumulco","Chuacus","Puuc"], jungle:["Peten","Mutal","Lakamha","Oxwitik","Oxwitza","Pachan","Yokib","Saal","Waka","Chiknahb","Baakal","Kaan","Popo","Chatahn"]},
  CIVILIZATION_AKSUM: {islands:["Alalaiou","Dioscorides","Menuthias","Farasan","Iotabe","Topazos"], deserts:["Beja","Noba","Trogodytica","Hadramaut"], mountains:["Semien"], jungle:["Azania"]},
  CIVILIZATION_MISSISSIPPIAN: {mountains:["Unaka","Unicoi","Nantahala","Cohutta","Cheoah","Yonah","Chilhowee","Wayah","Tusquitee","Cowee","Alarka"]},
  CIVILIZATION_ABBASID: {islands:["Siqilliya","Iqritish","Qubrus","Sardaniya","Sarandib","Suqutra","Awal","Qays","Malta","Rudus","Jarba","Khark","Dahlak","Qawsara"], deserts:["Rub al-Khali","Nafud","Dahna","Tih","Faran","Samawa","Hamad","Sarir","Lut","Kavir","Registan","Nuba"], mountains:["Lubnan","Lukkam","Qabq","Daran","Awras","Alburz","Dunbawand","Judi","Sinjar","Qasiyun","Tuwayq","Sarat","Hamrin","Uhud","Radwa","Aja"], taiga:["Bulghar","Wisu","Yura","Saqaliba"], jungle:["Zanj","Sufala","Malibar","Zabaj","Kalah","Fansur","Lamuri","Ramni","Qimar","Sanf"]},
  CIVILIZATION_MONGOLIA: {islands:["Olkhon","Tsushima","Iki","Ganghwa","Java","Hainan","Penghu"], deserts:["Gobi","Ordos","Alashan","Tengger","Badain Jaran","Mu Us","Ulan Buh","Kyzylkum","Karakum","Betpak-Dala","Taklamakan","Registan","Kavir","Lut"], mountains:["Altai","Khangai","Khentii","Burkhan Khaldun","Sayan","Khingan","Yin Shan","Tengri Tag","Kunlun","Pamir","Hindu Kush","Caucasus","Elburz","Zagros","Carpathian","Ural"], taiga:["Khovsgol","Barguzin","Selenga","Onon","Ergune","Tannu","Khamar Daban","Baigal","Angara","Yenisei"], jungle:["Champa","Annam","Mien","Karajang"]},
  CIVILIZATION_MING: {islands:["Hainan","Chongming","Zhoushan","Penghu","Putuo","Nanao","Weizhou","Liuqiu","Sulu","Boni","Zhaowa","Sumendala","Xilan","Liushan"], deserts:["Gebi","Hanhai","Liusha","Longsha"], mountains:["Tai","Hua","Heng","Song","Emei","Wutai","Wudang","Huang","Lu","Wuyi","Taihang","Yin","Kunlun","Qilian","Tian","Congling"], taiga:["Nurgan","Heilong","Changbai","Songhua","Wusuli","Jianzhou","Haixi"], jungle:["Jiaozhi","Annan","Zhancheng","Zhenla","Xianluo","Cheli","Luchuan","Lingnan","Manlajia","Miandian","Baigu"]},
  CIVILIZATION_CHOLA: {islands:["Ilam","Manakkavaram","Maladivu","Nainativu","Velanai","Karaitivu"], mountains:["Podigai","Kolli","Venkatam","Palani","Anaimalai","Sahya","Malaya","Nilagiri","Sirumalai","Palamalai","Kudiramalai","Vellimalai"], jungle:["Tillai","Vedaranyam","Dandakam","Vanni","Kadambavanam"]},
  CIVILIZATION_MAJAPAHIT: {islands:["Jawa","Bali","Madura","Swarnadwipa","Sunda","Timur","Bima","Wandan","Ambwan","Maloko","Butun","Selaya","Bangka","Gurun","Sukun","Makasar"], mountains:["Mahameru","Kampud","Pawitra","Kawi","Arjuna","Wilis","Brahma","Hyang","Lawu","Damalung","Merapi","Sundara","Raung","Anjasmara"], jungle:["Pahang","Langkasuka","Tumasik","Kelantan","Trengganu","Dungun","Muar","Barus","Lamuri","Melayu","Wwanin","Seran","Jerai","Kedah"]},
  CIVILIZATION_INCA: {islands:["Koati","Amantani","Taquile","Suriqui","Pariti","Kalauta","Anapia","Sangayan","Puna"], deserts:["Atacama","Sechura","Nasca","Ica","Paracas"], mountains:["Salkantay","Awsangate","Waqaywillka","Qurupuna","Sara Sara","Ampato","Pichu Pichu","Chachani","Misti","Illimani","Illampu","Wanakawri","Pumasillo","Waynapikchu","Willkanuta"], jungle:["Antisuyu","Willkapampa","Pawqartampu","Amarumayu","Marcapata","Kosnipata","Opatari","Tambopata","Chinchipe"]},
  CIVILIZATION_NORMAN: {islands:["Sicile","Melite","Wiht","Gersey","Guernesey","Man","Chypre","Rodes","Crete","Corse","Sardaigne","Orkneyjar","Hjaltland","Gotland","Corfou","Cefalonie"], deserts:["Sinai","Arabie","Libye","Judee","Idumee","Nubie","Barca"], mountains:["Alpes","Apennins","Pyrenees","Vosges","Ardennes","Jura","Cevennes","Taurus","Liban","Amanus","Carmel","Tabor","Cheviot","Snowdon","Etna"], taiga:["Noregr","Svithjod","Gardariki","Bjarmaland","Finnmork","Kvenland","Halogaland","Jamtaland","Vermaland","Helsingland","Angermannaland","Medalpad","Hedmork","Trondheim","Gestrikaland"]},
  CIVILIZATION_SONGHAI: {deserts:["Sahra","Azawad","Tanezrouft","Tenere","Majabat","Aoukar","Hodh","El Djouf","Erg Chech","Igidi"], mountains:["Air","Adrar","Ahaggar","Tassili","Hombori","Bandiagara","Tagant","Assaba","Fouta","Manding","Bambuk","Timetrine"], jungle:["Bono","Wangara","Lobi"]},
  CIVILIZATION_SPAIN: {islands:["Mallorca","Menorca","Ibiza","Formentera","Sicilia","Cerdena","Corcega","Malta","Lanzarote","Fuerteventura","Gran Canaria","La Gomera","La Palma","Tenerife","El Hierro"], deserts:["Bardenas","Monegros","Tabernas"], mountains:["Pirineos","Guadarrama","Gredos","Morena","Moncayo","Cantabrica","Toledo","Albarracin","Segura","Cazorla","Ronda","Urbion","Demanda","Gata"]},
  CIVILIZATION_HAWAII: {islands:["Hawaii","Maui","Oahu","Kauai","Molokai","Lanai","Niihau","Kahoolawe","Nihoa","Mokumanamana","Lehua","Kaula","Molokini","Manana","Mokolii"], mountains:["Mauna Kea","Mauna Loa","Hualalai","Haleakala","Kohala","Koolau","Waianae","Waialeale","Kaala","Konahuanui","Puu Kukui","Olomana","Lanihuli"], jungle:["Puna","Hana","Waipio","Hamakua","Kalalau","Manoa","Nuuanu","Wailua","Hilo","Olaa","Kipahulu","Halawa"]},
  CIVILIZATION_QING: {islands:["Taiwan","Hainan","Zhoushan","Chongming","Xiamen","Jinmen","Penghu","Putuo","Gulangyu","Haitan","Kuye","Dongshan","Nanao"], deserts:["Gebi","Taklamakan","Ordos","Tengger","Badain Jaran","Kumtag","Lop","Mu Us","Hunshandake"], mountains:["Changbai","Tianshan","Kunlun","Altai","Qilian","Wutai","Emei","Tai","Hua","Heng","Song","Qinling","Congling","Xing'an","Wuyi","Yin"], taiga:["Changbai","Xing'an","Heilongjiang","Jilin","Wusuli","Songhua","Mudan"], jungle:["Yunnan","Lingnan","Cheli","Puer","Tengyue"]},
  CIVILIZATION_RUSSIA: {islands:["Kotlin","Valaam","Kizhi","Solovki","Novaya Zemlya","Vaygach","Kolguyev","Sakhalin","Kildin","Konevets","Beringa","Unalashka","Kadyak","Sitkha"], deserts:["Karakum","Kyzylkum","Muyunkum","Betpak-Dala","Ustyurt","Ryn"], mountains:["Ural","Kavkaz","Altai","Sayany","Zhiguli","Yablonovyy","Stanovoy","Verkhoyansk","Valdai","Timan","Elbrus","Kazbek","Beshtau","Khibiny"], taiga:["Vasyugan","Narym","Tunguska","Vitim","Turukhansk","Mangazeya","Konda","Pelym","Yugra","Berezov","Ket","Ilim"]},
  CIVILIZATION_MUGHAL: {islands:["Sarandib","Suqutra","Hormuz","Bahrain","Qais","Zangibar","Diu","Mahaldib","Sashti","Gharapuri","Lakadib","Kharg","Masira","Kamaran"], deserts:["Registan","Thar","Cholistan","Lut","Kavir","Kharan"], mountains:["Himalaya","Hindukush","Karakoram","Sulaiman","Safed Koh","Aravalli","Vindhya","Satpura","Sahyadri","Kirthar","Pamir","Nilgiri","Girnar","Siwalik"], jungle:["Sundarban","Terai","Gondwana","Dandaka","Bastar","Gir","Jharkhand","Bhabar"]},
  CIVILIZATION_PRUSSIA: {islands:["Ruegen","Usedom","Wollin","Fehmarn","Poel","Hiddensee","Sylt","Foehr","Amrum","Nordstrand","Pellworm","Bornholm","Oeland","Gotland"], mountains:["Harz","Sudeten","Karpaten","Alpen","Eifel","Taunus","Rhoen","Spessart","Fichtel","Erz","Riesen","Vogesen","Ardennen","Hunsrueck"], taiga:["Rominten","Johannisburg","Masuren","Ermland","Samland","Natangen","Kurland","Tuchel"]},
  CIVILIZATION_FRENCH_EMPIRE: {islands:["Corse","Oleron","Ouessant","Noirmoutier","Groix","Bourbon","Martinique","Guadeloupe","Goree","Tortue","Marie-Galante","Sardaigne","Malte","Chypre"], deserts:["Sahara","Libyque","Nubie","Sinai","Arabie","Fezzan","Barca","Syrie","Thebaide"], mountains:["Alpes","Pyrenees","Vosges","Jura","Cevennes","Ardennes","Auvergne","Morvan","Cantal","Corbieres","Atlas","Apennins","Carpates","Maures"], taiga:["Saguenay","Labrador","Acadie","Canada","Siberie","Laponie","Tartarie","Moscovie"], jungle:["Guyane","Amazone","Louisiane","Senegal","Guinee","Congo","Madagascar","Malabar","Coromandel","Bengale","Maragnan"]},
  CIVILIZATION_AMERICA: {islands:["Nantucket","Roanoke","Manhattan","Mackinac","Catalina","Galveston","Block","Tybee","Padre","Cumberland","Sullivan","Chincoteague","Assateague","Staten"], deserts:["Mojave","Colorado","Great Basin","Black Rock","Painted","Amargosa","Escalante","Yuma","Carson","Forty Mile","Smoke Creek","Red"], mountains:["Rocky","Appalachian","Allegheny","Blue Ridge","Great Smoky","Cascade","Wasatch","Bighorn","Green","White","Catskill","Adirondack","Ozark","Teton","Sangre de Cristo","Wind River"], taiga:["Aroostook","Allagash","Moosehead","Rangeley","Penobscot","Katahdin","Superior","Itasca","Vermilion","Chippewa","Yukon","Tanana"], jungle:["Everglades","Big Cypress","Okefenokee","Loxahatchee","Withlacoochee","Kissimmee","Caloosahatchee","Atchafalaya","Suwannee"]},
  CIVILIZATION_MEXICO: {islands:["Cozumel","Mujeres","Holbox","Contoy","Carmen","Sacrificios","Lobos","Tiburon","Cedros","Guadalupe","Espiritu Santo","Angel de la Guarda","Tres Marias","Roqueta","Mexcaltitan","Todos Santos"], deserts:["Sonora","Chihuahua","Altar","Mapimi","Vizcaino","Samalayuca"], mountains:["Popocatepetl","Iztaccihuatl","Orizaba","Malinche","Ajusco","Colima","Toluca","Tancitaro","Zempoaltepetl","Nauhcampatepetl","Tarahumara","Nevada"], jungle:["Lacandona","Chiapas","Tabasco","Yucatan","Soconusco","Chimalapas","Tuxtlas","Uxpanapa"]},
  CIVILIZATION_MEIJI: {islands:["Sado","Awaji","Oki","Tsushima","Iki","Hachijo","Amakusa","Rishiri","Rebun","Tanegashima","Enoshima","Shodoshima","Miyajima","Oshima"], mountains:["Fuji","Hida","Kiso","Akaishi","Ou","Kii","Echigo","Hakone","Asama","Ontake","Tateyama","Hakusan","Aso","Kirishima"], taiga:["Ezo","Karafuto","Daisetsu","Hidaka","Ishikari","Tokachi","Kushiro","Abashiri","Teshio","Kitami","Chishima","Nemuro","Akan","Shiretoko"], jungle:["Ryukyu","Okinawa","Amami","Iriomote","Yaeyama","Ishigaki","Ogasawara","Yakushima","Tokara","Miyako","Taiwan","Iheya"]},
  CIVILIZATION_SIAM: {islands:["Phuket","Samui","Chang","Sichang","Kut","Mak","Phangan","Tao","Lanta","Yao","Libong","Tarutao","Adang","Similan"], mountains:["Dong Phaya Yen","Tanao Si","Thanon Thongchai","Phi Pan Nam","Khao Luang","Phu Phan","Dong Rak","Phetchabun","Suthep","Chiang Dao","Sankamphaeng","Banthat","Sam Roi Yot","Kradueng"], jungle:["Dong Phaya Fai","Dong Yai","Dong Mun"]},
  CIVILIZATION_BUGANDA: {islands:["Ssese","Bugala","Bukasa","Bubeke","Bubembe","Bufumira","Serinya","Funve","Nsadzi","Bugaba","Buvuma","Damba","Kome"], mountains:["Mengo","Rubaga","Kasubi","Namirembe","Nakasero","Kibuli","Nsambya","Mulago","Buddo","Banda","Lubya"], jungle:["Mabira","Mpanga","Zika","Namanve","Kifu","Lwamunda","Kasa","Lutoboka"]},
};

const GENERIC = {
  islands: ["Avalon", "Thule", "Hesperia", "Zephyra", "Calypso", "Halcyon", "Nerida", "Corvenna", "Marisol", "Selkie", "Skerry", "Fenwick", "Windward", "Kestrel", "Mistral", "Solvenn"],
  deserts: ["Ashland", "Sunmere", "Dustreach", "Scorchwold", "Drymarch", "Sandmere", "Emberwaste", "Palewaste"],
  mountains: ["Highridge", "Cloudpeak", "Stormcrest", "Frosthorn", "Greywall", "Skyreach", "Blackridge", "Stonecrown", "Ironback", "Snowcrest"],
  taiga: ["Frostwood", "Pinemarch", "Wintergarth", "Snowveil", "Coldreach", "Elkwood", "Wolfwood", "Frostmere"],
  jungle: ["Greenmaw", "Mistwood", "Serpentwood", "Ferndeep", "Vinehall", "Palmreach", "Thornwild", "Emberferns"],
};
const NEUTRAL = GENERIC.islands;

// ---- helpers ------------------------------------------------------------------------------------
function log() { try { console.error.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
function safe(fn) { try { return fn(); } catch (_e) { return undefined; } }
function dims() { return { w: GameplayMap.getGridWidth(), h: GameplayMap.getGridHeight() }; }
function gameSeed() { return (safe(() => Configuration.getGame().gameSeed) || 1) >>> 0; }
function centroid(plots) {
  let sx = 0, sy = 0; for (const p of plots) { sx += p.x; sy += p.y; }
  const cx = sx / plots.length, cy = sy / plots.length;
  let best = plots[0], bd = Infinity;
  for (const p of plots) { const d = (p.x - cx) ** 2 + (p.y - cy) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
function scaledFont(size) { const f = (3 + 1.15 * Math.log(Math.max(2, size))) * FONT_SCALE; return Math.max(5, Math.min(16, Math.round(f * 10) / 10)); }
function styleText(s) {
  const up = String(s).toUpperCase(), wg = NBSP + NBSP + NBSP + NBSP;
  return up.split(/\s+/).filter(Boolean).map((w) => w.replace(/([A-Z0-9])(?=[A-Z0-9])/g, "$1" + NBSP)).join(wg);
}
function mulberry32(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffled(arr, rand) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function hash01(s) { let h = (2166136261 ^ gameSeed()) >>> 0; const str = String(s); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function neighbors(p, w, h) { const out = []; for (let d = 0; d < 6; d++) { const n = safe(() => GameplayMap.getAdjacentPlotLocation({ x: p.x, y: p.y }, d)); if (n && typeof n.x === "number" && n.x >= 0 && n.y >= 0 && n.x < w && n.y < h) out.push(n); } return out; }

// ---- persistence --------------------------------------------------------------------------------
function loadGame() {
  return safe(() => { const raw = localStorage.getItem(STORE_KEY); const all = raw ? JSON.parse(raw) : {}; const g = all[String(gameSeed())] || {}; return { custom: g.custom || {}, auto: g.auto || {} }; }) || { custom: {}, auto: {} };
}
function saveGame(state) {
  safe(() => { const raw = localStorage.getItem(STORE_KEY); const all = raw ? JSON.parse(raw) : {}; all[String(gameSeed())] = { custom: state.custom || {}, auto: state.auto || {} }; localStorage.setItem(STORE_KEY, JSON.stringify(all)); });
}
function setCustom(key, name) { const s = loadGame(); const v = (name || "").trim(); if (v) s.custom[key] = v; else delete s.custom[key]; saveGame(s); }

// ---- nearest civ (string CivilizationType + tile distance) --------------------------------------
function nearestCiv(plots, w, h) {
  const c = centroid(plots), R = 12;
  for (let r = 0; r <= R; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (safe(() => GameplayMap.getPlotDistance(c.x, c.y, x, y)) !== r) continue;
      const owner = safe(() => GameplayMap.getOwner(x, y));
      if (typeof owner !== "number" || owner < 0) continue;
      const pl = safe(() => Players.get(owner));
      const def = pl && pl.civilizationType != null ? safe(() => GameInfo.Civilizations.lookup(pl.civilizationType)) : null;
      const ct = def && def.CivilizationType;
      if (ct && ct !== "CIVILIZATION_INDEPENDENT" && ct !== "CIVILIZATION_NONE") return { civ: ct, dist: r };
    }
  }
  return { civ: null, dist: 999 };
}

function frame(typeKey, name) {
  if (typeKey === "islands") return "Isle of " + name;
  if (typeKey === "deserts") return name + " Desert";
  if (typeKey === "mountains") return name + " Mountains";
  if (typeKey === "taiga") return name + " Taiga";
  if (typeKey === "jungle") return name + " Jungle";
  return name;
}

// ---- classification + naming (with persistence + heartland re-flavor tides) ---------------------
function computeLabels() {
  const { w, h } = dims();
  const state = loadGame();
  const custom = state.custom, auto = state.auto;
  const rand = mulberry32(gameSeed());

  // name-pool machinery (per-render de-dup + seeded shuffles)
  const used = new Set(), cursors = new Map(), shufCache = new Map();
  const poolArray = (civ, tk) => (civ && CIV_NAMES[civ] && CIV_NAMES[civ][tk] && CIV_NAMES[civ][tk].length ? CIV_NAMES[civ][tk] : (GENERIC[tk] || NEUTRAL));
  const shuf = (civ, tk) => { const k = (civ || "_") + ":" + tk; let s = shufCache.get(k); if (!s) { s = shuffled(poolArray(civ, tk), rand); shufCache.set(k, s); } return s; };
  function nextName(civ, tk) {
    const s = shuf(civ, tk), k = (civ || "_") + ":" + tk; let i = cursors.get(k) || 0;
    for (let t = 0; t < s.length; t++, i++) { const nm = s[i % s.length]; if (!used.has(nm)) { cursors.set(k, i + 1); used.add(nm); return nm; } }
    for (const nm of NEUTRAL) if (!used.has(nm)) { used.add(nm); return nm; }
    cursors.set(k, i + 1); return s[i % s.length];
  }

  // ---- read the whole map: land areas, wonders, biome/mountain tiles ----
  const land = new Map(), wonders = new Map(), biomeTiles = new Map(), mountainTiles = new Set(), biomeStr = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const water = safe(() => GameplayMap.isWater(x, y)) === true;
    if (!water) {
      const a = safe(() => GameplayMap.getAreaId(x, y));
      if (typeof a === "number" && a > -1) { let r = land.get(a); if (!r) { r = { id: a, plots: [], continent: safe(() => GameplayMap.getContinentType(x, y)) }; land.set(a, r); } r.plots.push({ x, y }); }
      if (safe(() => GameplayMap.isMountain(x, y)) === true) mountainTiles.add(x + "," + y);
      const bt = safe(() => GameplayMap.getBiomeType(x, y));
      if (typeof bt === "number") { let bs = biomeStr.get(bt); if (bs === undefined) { const d = safe(() => GameInfo.Biomes.lookup(bt)); bs = (d && d.BiomeType) || null; biomeStr.set(bt, bs); } if (bs) { if (!biomeTiles.has(bs)) biomeTiles.set(bs, new Set()); biomeTiles.get(bs).add(x + "," + y); } }
    }
    if (safe(() => GameplayMap.isNaturalWonder(x, y)) === true) {
      const ft = safe(() => GameplayMap.getFeatureType(x, y));
      if (typeof ft === "number" && ft !== -1) { let wr = wonders.get(ft); if (!wr) { const d = safe(() => GameInfo.Features.lookup(ft)); wr = { name: (d && d.Name && safe(() => Locale.compose(d.Name))) || "Wonder", plots: [] }; wonders.set(ft, wr); } wr.plots.push({ x, y }); }
    }
  }
  const areas = [...land.values()];

  // ocean-crossing flood-fill from large landmasses -> islands are what it can't reach
  const reached = new Set(), q = [];
  for (const a of areas) if (a.plots.length >= CONTINENT_MIN_TILES) for (const p of a.plots) { const k = p.x + "," + p.y; if (!reached.has(k)) { reached.add(k); q.push(p); } }
  const crossable = (x, y) => { if (safe(() => GameplayMap.isWater(x, y)) !== true) return true; if (safe(() => GameplayMap.isLake(x, y)) === true) return true; if (safe(() => GameplayMap.isNavigableRiver(x, y)) === true) return true; return false; };
  while (q.length) { const p = q.pop(); for (const n of neighbors(p, w, h)) { const k = n.x + "," + n.y; if (reached.has(k) || !crossable(n.x, n.y)) continue; reached.add(k); q.push(n); } }

  function regionsOf(tileSet) {
    const rem = new Set(tileSet), regions = [];
    for (const start of tileSet) { if (!rem.has(start)) continue; const plots = [], st = [start]; rem.delete(start); while (st.length) { const k = st.pop(); const c = k.indexOf(","); const p = { x: +k.slice(0, c), y: +k.slice(c + 1) }; plots.push(p); for (const n of neighbors(p, w, h)) { const nk = n.x + "," + n.y; if (rem.has(nk)) { rem.delete(nk); st.push(nk); } } } regions.push(plots); }
    return regions;
  }

  // ---- gather civ-attributed features (islands + regions), keyed stably ----
  const feats = []; // { key, typeKey, plots }
  const islands = areas.filter((a) => a.plots.length >= MIN_LABEL_TILES && !a.plots.some((p) => reached.has(p.x + "," + p.y)));
  for (const a of islands) feats.push({ key: "isle:" + a.id, typeKey: "islands", plots: a.plots });
  for (const cat of REGION_CATS) {
    const tiles = cat.mountain ? mountainTiles : (biomeTiles.get(cat.biome) || new Set());
    for (const plots of regionsOf(tiles)) { if (plots.length < cat.min) continue; const key = cat.typeKey + ":" + Math.min.apply(null, plots.map((p) => p.x + p.y * w)); feats.push({ key, typeKey: cat.typeKey, plots }); }
  }

  // pre-reserve existing auto names so new assignments never steal them
  for (const f of feats) if (auto[f.key] && auto[f.key].n) used.add(auto[f.key].n);

  const labels = [];
  let nFlip = 0;

  // continents (engine names) + wonders (engine names) — no civ tides
  for (const a of areas) {
    if (a.plots.length < CONTINENT_MIN_TILES) continue;
    let nm = null; if (typeof a.continent === "number" && a.continent !== -1) { const d = safe(() => GameInfo.Continents.lookup(a.continent)); if (d && d.Description) nm = safe(() => Locale.compose(d.Description)); }
    const key = "cont:" + a.id, text = custom[key] || nm; if (text) labels.push({ key, plot: centroid(a.plots), text, fontSize: scaledFont(a.plots.length) });
  }
  for (const [ft, wr] of wonders) { const key = "wonder:" + ft; labels.push({ key, plot: centroid(wr.plots), text: custom[key] || wr.name, fontSize: scaledFont(wr.plots.length), offset: { x: 0, y: WONDER_OFFSET, z: 8 + WONDER_OFFSET } }); }

  // islands + regions — persistent names with heartland re-flavor
  for (const f of feats) {
    let toponym;
    if (custom[f.key]) { labels.push({ key: f.key, plot: centroid(f.plots), text: custom[f.key], fontSize: scaledFont(f.plots.length) }); continue; }
    const prev = auto[f.key];
    const near = nearestCiv(f.plots, w, h);
    if (!prev) { toponym = nextName(near.civ, f.typeKey); auto[f.key] = { n: toponym, c: near.civ || "" }; }
    else if ((prev.c || "") === (near.civ || "")) { toponym = prev.n; }
    else if (near.civ && near.dist <= HEARTLAND_RADIUS && hash01(f.key) < Math.max(0, 1 - near.dist / (HEARTLAND_RADIUS + 1))) {
      used.delete(prev.n); toponym = nextName(near.civ, f.typeKey); auto[f.key] = { n: toponym, c: near.civ }; nFlip++;
    } else { toponym = prev.n; }
    labels.push({ key: f.key, plot: centroid(f.plots), text: frame(f.typeKey, toponym), fontSize: scaledFont(f.plots.length) });
  }

  // prune auto entries for features that no longer exist, then persist
  const liveKeys = new Set(feats.map((f) => f.key));
  for (const k of Object.keys(auto)) if (!liveKeys.has(k)) delete auto[k];
  saveGame({ custom, auto });

  log("computed", labels.length, "labels:", islands.length, "islands,", feats.length - islands.length, "regions,", wonders.size, "wonders,", nFlip, "re-flavored");
  return labels;
}

// ---- lens layer ---------------------------------------------------------------------------------
class GeoLabelsLayer {
  constructor() { this._group = null; this._grid = null; this._drawn = false; this._visible = false; this._labels = null; this._lastAge = safe(() => Game.age); }
  _ensure() { if (this._grid) return true; return safe(() => { this._group = WorldUI.createOverlayGroup("GeoLabelsOverlay", 10); this._grid = WorldUI.createSpriteGrid("GeoLabelsGrid", true); return true; }) === true; }
  _draw() {
    if (this._drawn || !this._ensure()) return;
    const fill = (LABEL_ALPHA & 0xff) * 0x1000000 + 0xffffff;
    this._labels = computeLabels();
    for (const l of this._labels) { const idx = safe(() => GameplayMap.getIndexFromXY(l.plot.x, l.plot.y)); const ref = (typeof idx === "number") ? idx : l.plot; const off = l.offset || { x: 0, y: 0, z: 8 }; safe(() => this._grid.addText(ref, styleText(l.text), off, { fonts: FONTS, fontSize: l.fontSize, stroke: LABEL_STROKE, fill, faceCamera: FACE_CAMERA })); }
    this._drawn = true;
  }
  _redraw() { safe(() => this._grid && this._grid.clear()); this._drawn = false; this._labels = null; this._draw(); }
  labels() { return this._labels || (this._labels = computeLabels()); }
  initLayer() {}
  applyLayer() { this._visible = true; this._draw(); safe(() => this._grid && this._grid.setVisible(true)); }
  removeLayer() { this._visible = false; safe(() => this._grid && this._grid.setVisible(false)); }
  onAgeMaybeChanged() { const a = safe(() => Game.age); if (a !== this._lastAge) { this._lastAge = a; if (this._visible) this._redraw(); else { this._drawn = false; this._labels = null; } } }
}

const instance = new GeoLabelsLayer();
safe(() => LensManager.registerLensLayer(LAYER_TYPE, instance));
try {
  if (typeof window !== "undefined") window.__geoLabels = {
    type: LAYER_TYPE,
    recompute: () => instance._redraw(),
    getLabels: () => instance.labels().map((l) => ({ key: l.key, text: l.text, type: l.key.slice(0, l.key.indexOf(":")) })),
    setName: (key, name) => { setCustom(key, name); instance._redraw(); },
  };
} catch (_e) {}
try { if (typeof window !== "undefined") window.addEventListener("tmt-geo-labels-changed", () => instance._redraw()); } catch (_e) {}
// Re-flavor at age transitions (cheap age check per turn; full recompute only when the age actually changes).
try { if (typeof engine !== "undefined" && engine.on) engine.on("PlayerTurnActivated", () => instance.onAgeMaybeChanged()); } catch (_e) {}
log("layer registered:", LAYER_TYPE);

export { LAYER_TYPE };
