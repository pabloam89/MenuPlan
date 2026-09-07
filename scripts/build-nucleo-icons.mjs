// Genera src/components/icons.jsx a partir de la biblioteca local de Nucleo.
//
// La app usa una única familia: **core / outline / 24px**, que es la que admite
// `strokeWidth` (por defecto 2, 2.4 en activo — ver DESIGN_SYSTEM.md §5) y
// `corners`. Aquí se fija `corners: "round"` porque el sistema de diseño pide
// redondez en todo (§0.6).
//
// Los componentes de Nucleo NO se importan desde ~/.nucleo/skills: se copian al
// repo (es lo que pide la licencia y evita depender de una ruta de la máquina).
// Este script hace esa copia, traduciendo el .tsx de Nucleo a un componente JSX
// con la misma API que tenía `lucide-react` (size / strokeWidth / color / fill),
// para que las 51 pantallas no tengan que cambiar más que la línea del import.
//
//   npm run build:icons
//
// Para añadir un icono: busca el componente en la biblioteca (familia core,
// relleno outline, 24px), añade la pareja aquí y vuelve a lanzar el script.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const NUCLEO = process.env.NUCLEO_SKILLS_ROOT || join(process.env.USERPROFILE || process.env.HOME, ".nucleo", "skills");
const COMPONENTS = join(NUCLEO, "core", "components");
const OUT = fileURLToPath(new URL("../src/components/icons.jsx", import.meta.url));

// nombre que usa la app  ->  componente de Nucleo (core / outline / 24px)
// `glyph` es la versión sólida, que se pinta cuando el icono recibe `fill`
// (el corazón de un favorito, el pulgar de un voto ya emitido).
const MAP = {
  AlertTriangle: "TriangleWarningOutline24",
  Apple: "AppleOutline24",
  ArrowLeftRight: "ArrowsOppositeDirectionXOutline24",
  ArrowRight: "ArrowRightOutline24",
  ArrowUp: "ArrowUpOutline24",
  ArrowUpDown: "ArrowsOppositeDirectionYOutline24",
  ArrowUpRight: "ArrowUpRightOutline24",
  AtSign: "AtSignOutline24",
  Baby: "BabyOutline24",
  Ban: "BanOutline24",
  BarChart3: "ChartOutline24",
  Bean: "PeasOutline24",
  Beef: "SteakOutline24",
  Bell: "BellOutline24",
  BellOff: "BellSlashOutline24",
  Blend: "BlenderOutline24",
  BookOpen: "BookOpenOutline24",
  BookOpenCheck: "BookOpen3Outline24",
  Bot: "FaceRobotOutline24",
  Boxes: "StorageShelfOutline24",
  BriefcaseBusiness: "SuitcaseOutline24",
  Calendar: "CalendarOutline24",
  CalendarDays: "CalendarOutline24",
  CalendarOff: "CalendarOutline24",
  CalendarRange: "CalendarEventOutline24",
  Camera: "CameraOutline24",
  Carrot: "CarrotOutline24",
  Check: "CheckOutline24",
  CheckCircle2: "CircleCheckOutline24",
  ChefHat: "ChefHatOutline24",
  ChevronDown: "ChevronDownOutline24",
  ChevronLeft: "ChevronLeftOutline24",
  ChevronRight: "ChevronRightOutline24",
  ChevronUp: "ChevronUpOutline24",
  CircleDot: "MediaRecordOutline24",
  CircleHelp: "CircleQuestionOutline24",
  ClipboardCheck: "ClipboardCheckOutline24",
  ClipboardList: "ClipboardContentOutline24",
  Clock: "ClockOutline24",
  Clock3: "Clock2Outline24",
  Coffee: "CoffeeCupOutline24",
  Coins: "CoinsOutline24",
  Compass: "CompassOutline24",
  CookingPot: "CookingPotOutline24",
  CopyPlus: "CopiesPlusOutline24",
  CornerDownRight: "ArrowCornerBottomRightOutline24",
  Croissant: "CroissantOutline24",
  Download: "DownloadOutline24",
  Droplet: "DropletOutline24",
  Droplets: "DropletsOutline24",
  Drumstick: "ChickenLegOutline24",
  Dumbbell: "DumbbellOutline24",
  Egg: "EggsOutline24",
  Eraser: "EraserOutline24",
  Euro: "CurrencyEuroOutline24",
  Expand: "ExpandOutline24",
  Eye: "EyeOutline24",
  EyeOff: "EyeSlashOutline24",
  FileText: "FileContentOutline24",
  Fish: "FishOutline24",
  Flag: "FlagOutline24",
  Flame: "FireOutline24",
  FlaskConical: "FlaskOutline24",
  Folder: "FolderOutline24",
  FolderPlus: "FolderPlusOutline24",
  Gauge: "Gauge2Outline24",
  GitBranch: "BranchOutOutline24",
  Glasses: "GlassesOutline24",
  Globe: "GlobeOutline24",
  Hash: "HashtagOutline24",
  Heart: { outline: "HeartOutline24", glyph: "HeartGlyph24" },
  HeartPulse: "PulseOutline24",
  History: "HistoryOutline24",
  Home: "House5Outline24",
  House: "House5Outline24",
  IceCream: "IceCreamOutline24",
  ImagePlus: "ImagePlusOutline24",
  Info: "CircleInfoOutline24",
  Layers: "LayersOutline24",
  Layers2: "Layers2Outline24",
  LayoutDashboard: "GridLayoutOutline24",
  LayoutGrid: "GridOutline24",
  Leaf: "LeafOutline24",
  Link2: "LinkOutline24",
  ListOrdered: "OrderedListOutline24",
  Loader2: "SpinnerLoaderOutline24",
  Lock: "LockOutline24",
  LogOut: "RectLogoutOutline24",
  Mars: "MarsOutline24",
  Meh: "FaceNeutralOutline24",
  Menu: "MenuOutline24",
  MessageCircle: "MessageOutline24",
  MessageSquarePlus: "ChatBubblePlusOutline24",
  Microwave: "MicrowaveOutline24",
  Milk: "MilkContainerOutline24",
  // Nucleo no trae "milk-slash": el "sin" lo dice la etiqueta que acompaña.
  MilkOff: "MilkContainerOutline24",
  Minimize2: "ArrowsToCenterOutline24",
  Minus: "MinusOutline24",
  Moon: "MoonOutline24",
  MoreHorizontal: "DotsOutline24",
  MoreVertical: "DotsVerticalOutline24",
  NotebookPen: "NotebookOutline24",
  Nut: "PeanutOutline24",
  Package: "BoxOutline24",
  Pencil: "PencilOutline24",
  PersonStanding: "PersonWalkingOutline24",
  Pizza: "PizzaOutline24",
  Play: "MediaPlayOutline24",
  Plus: "PlusOutline24",
  Receipt: "ReceiptOutline24",
  Refrigerator: "FridgeOutline24",
  Repeat: "Repeat2Outline24",
  RotateCcw: "Refresh2Outline24",
  RotateCw: "RefreshOutline24",
  Salad: "SaladOutline24",
  Scale: "ScaleOutline24",
  School: "SchoolBuildingOutline24",
  Search: "MagnifierOutline24",
  Send: "PaperPlaneOutline24",
  Settings: "GearOutline24",
  Share: "ExportOutline24",
  Share2: "ConnectedDotsOutline24",
  Shell: "ShellOutline24",
  ShieldCheck: "ShieldCheckOutline24",
  ShieldOff: "Shield2Outline24",
  ShoppingBag: "BagShoppingOutline24",
  ShoppingBasket: "BasketShoppingOutline24",
  ShoppingCart: "CartOutline24",
  Shrimp: "ShrimpOutline24",
  Shuffle: "ShuffleOutline24",
  SlidersHorizontal: "Sliders2Outline24",
  Snowflake: "SnowflakeOutline24",
  Soup: "SoupOutline24",
  Sparkles: "SparkleOutline24",
  Sprout: "SeedlingOutline24",
  Star: "StarOutline24",
  Store: "StoreOutline24",
  Sun: "SunOutline24",
  Sunset: "SunHazeOutline24",
  Tag: "TagOutline24",
  ThumbsDown: { outline: "ThumbsDownOutline24", glyph: "ThumbsDownGlyph24" },
  ThumbsUp: { outline: "ThumbsUpOutline24", glyph: "ThumbsUpGlyph24" },
  Trash2: "TrashOutline24",
  TrendingUp: "ArrowTrendUpOutline24",
  Undo2: "UndoOutline24",
  Upload: "UploadOutline24",
  User: "UserOutline24",
  UserCheck: "UserCheckOutline24",
  UserCircle: "CircleUserOutline24",
  UserMinus: "UserMinusOutline24",
  UserPlus: "UserPlusOutline24",
  UserRound: "User2Outline24",
  Users: "UsersOutline24",
  Users2: "Users2Outline24",
  UsersRound: "Users3Outline24",
  Utensils: "CutleryOutline24",
  UtensilsCrossed: "Cutlery2Outline24",
  Venus: "VenusOutline24",
  Wallet: "WalletOutline24",
  Wand2: "WandOutline24",
  Wheat: "GrainOutline24",
  Wind: "WindOutline24",
  Wine: "WineGlassOutline24",
  Wrench: "WrenchOutline24",
  X: "XmarkOutline24",
  Zap: { outline: "BoltOutline24", glyph: "BoltGlyph24" },
};

// Saca el <svg>…</svg> del componente .tsx de Nucleo y le quita la cabecera
// del <svg>, que reescribimos nosotros para aceptar `size`.
function bodyOf(component) {
  const file = join(COMPONENTS, `${component}.tsx`);
  if (!existsSync(file)) throw new Error(`No existe el componente de Nucleo: ${component}`);
  const src = readFileSync(file, "utf8");
  const match = src.match(/return \(\s*([\s\S]*?)\s*\);\s*\}/);
  if (!match) throw new Error(`No se puede extraer el SVG de ${component}`);
  const svg = match[1];
  const open = svg.indexOf(">");
  const close = svg.lastIndexOf("</svg>");
  if (open === -1 || close === -1) throw new Error(`SVG con forma inesperada en ${component}`);
  return svg.slice(open + 1, close).trim();
}

function componentSource(name, entry) {
  const outlineName = typeof entry === "string" ? entry : entry.outline;
  const outline = bodyOf(outlineName);
  const glyph = typeof entry === "string" ? null : bodyOf(entry.glyph);

  // `strokeWidth` y `corners` solo se declaran si el trazado los usa: hay
  // iconos de Nucleo dibujados con formas rellenas que no tienen trazo.
  const usesStroke = outline.includes("{strokeWidth}");
  const usesCorners = outline.includes("corners ===");

  const params = ["size = 24"];
  if (usesStroke) params.push("strokeWidth = 2");
  if (usesCorners) params.push('corners = "round"');
  params.push("color", glyph ? "fill" : null, "style", "...rest");

  const svgOpen = (extra) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" ` +
    `style={${extra}} aria-hidden="true" {...rest}>`;

  if (!glyph) {
    return `export function ${name}({ ${params.filter(Boolean).join(", ")} }) {
  return (
    ${svgOpen("{ color, ...style }")}${outline}</svg>
  );
}`;
  }

  return `export function ${name}({ ${params.filter(Boolean).join(", ")} }) {
  const solid = fill && fill !== "none";
  return solid ? (
    ${svgOpen("{ color: fill, ...style }")}${glyph}</svg>
  ) : (
    ${svgOpen("{ color, ...style }")}${outline}</svg>
  );
}`;
}

const names = Object.keys(MAP).sort();
const header = `// GENERADO por scripts/build-nucleo-icons.mjs — no editar a mano.
//
// Iconografía de la app: Nucleo, familia **core / outline / 24px**.
// Cada componente mantiene la API que tenía lucide-react para no tocar las
// pantallas: \`size\` (24), \`strokeWidth\` (2; 2.4 en activo), \`color\`,
// \`style\` y el resto de props del <svg>. Los iconos que se pintan sólidos al
// activarse (Heart, ThumbsUp, ThumbsDown, Zap) aceptan además \`fill\`, que
// cambia al trazado glyph de Nucleo.
//
// Para añadir o cambiar un icono: edita el mapa del script y \`npm run build:icons\`.
`;

const out = [header, ...names.map((n) => componentSource(n, MAP[n]))].join("\n\n") + "\n";
writeFileSync(OUT, out, "utf8");
console.log(`${names.length} iconos escritos en src/components/icons.jsx`);
