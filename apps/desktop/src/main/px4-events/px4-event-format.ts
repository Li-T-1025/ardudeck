/**
 * PX4 Events: turning an EVENT (msgid 410) into human text.
 *
 * Since v1.13 PX4 sends most user-facing warnings and errors over the MAVLink
 * events interface instead of STATUSTEXT. EVENT carries only a 32-bit event id,
 * a log level and 40 bytes of packed arguments; the sentence lives in PX4's
 * event metadata (`all_events.json`, bundled by px4-events/index.ts). Without
 * this lookup an arming refusal shows up as nothing at all.
 *
 * Message templates use libevents placeholder syntax:
 *   {1}          argument 1 (1-based), formatted by its declared type
 *   {3:.1}       argument 3 with 1 decimal place
 *   {2m}         argument 2 with a unit suffix (m, m_v, m/s)
 *   {3:.1m/s}    both
 * Enum-typed arguments render as the enum entry's description, and bitfield
 * enums as a comma-joined list of the set bits.
 *
 * This module is pure so it can be tested against real payloads; the metadata
 * loading and caching live in ./index.ts.
 */

export interface Px4EventArgumentDef {
  name?: string;
  type: string;
  description?: string;
}

export interface Px4EventDef {
  name?: string;
  message?: string;
  description?: string;
  arguments?: Px4EventArgumentDef[];
}

export interface Px4EnumEntry {
  name?: string;
  description?: string;
}

export interface Px4EnumDef {
  type: string;
  is_bitfield?: boolean;
  entries: Record<string, Px4EnumEntry>;
}

export interface Px4EventComponent {
  namespace?: string;
  enums?: Record<string, Px4EnumDef>;
  event_groups?: Record<string, { events?: Record<string, Px4EventDef> }>;
}

export interface Px4EventMetadata {
  components?: Record<string, Px4EventComponent>;
}

export interface Px4EventEntry {
  def: Px4EventDef;
  /** Group the event came from: 'default', 'arming_check', 'health', ... */
  group: string;
  /** Enums declared by the owning component, looked up by bare name. */
  localEnums: Record<string, Px4EnumDef>;
  /** Every component's enums, keyed `namespace::name` for qualified types. */
  globalEnums: Map<string, Px4EnumDef>;
}

export type Px4EventIndex = Map<number, Px4EventEntry>;

/** Byte width of each base type an event argument can declare. */
const TYPE_WIDTH: Record<string, number> = {
  uint8_t: 1,
  int8_t: 1,
  uint16_t: 2,
  int16_t: 2,
  uint32_t: 4,
  int32_t: 4,
  float: 4,
  uint64_t: 8,
  int64_t: 8,
  double: 8,
};

/** Unit suffixes libevents allows in a placeholder, rendered metric. */
const UNIT_LABELS: Record<string, string> = {
  m: 'm',
  m_v: 'm',
  'm/s': 'm/s',
};

/**
 * Flatten PX4's event metadata into a wire-id -> event map.
 *
 * The metadata keys each event by its bare 24-bit name hash, per component. The
 * id on the wire is NOT that hash: libevents packs the component id into the
 * top byte, `id = (component_id << 24) | hash`. Indexing by the raw hash makes
 * every real event miss, so the wire form is what we key on. Verified against
 * PX4 SITL: wire id 26788467 is component 1, hash 10011251,
 * `check_modes_global_pos`.
 */
export function buildPx4EventIndex(metadata: Px4EventMetadata): Px4EventIndex {
  const index: Px4EventIndex = new Map();
  const globalEnums = new Map<string, Px4EnumDef>();

  const components = Object.entries(metadata.components ?? {});

  for (const [, component] of components) {
    const ns = component.namespace ?? '';
    for (const [enumName, enumDef] of Object.entries(component.enums ?? {})) {
      globalEnums.set(`${ns}::${enumName}`, enumDef);
    }
  }

  for (const [rawComponentId, component] of components) {
    const componentId = Number(rawComponentId);
    if (!Number.isFinite(componentId)) continue;
    const localEnums = component.enums ?? {};

    for (const [group, groupDef] of Object.entries(component.event_groups ?? {})) {
      for (const [rawHash, def] of Object.entries(groupDef.events ?? {})) {
        const hash = Number(rawHash);
        if (!Number.isFinite(hash)) continue;
        // eslint-disable-next-line no-bitwise
        const wireId = (((componentId << 24) >>> 0) + hash) >>> 0;
        if (index.has(wireId)) continue;
        index.set(wireId, { def, group, localEnums, globalEnums });
      }
    }
  }

  return index;
}

function resolveEnum(type: string, entry: Px4EventEntry): Px4EnumDef | undefined {
  if (type.includes('::')) return entry.globalEnums.get(type);
  return entry.localEnums[type];
}

/** Width in bytes of an argument, following enum types to their base type. */
function widthOf(type: string, entry: Px4EventEntry): number {
  const direct = TYPE_WIDTH[type];
  if (direct !== undefined) return direct;
  const enumDef = resolveEnum(type, entry);
  if (enumDef) return TYPE_WIDTH[enumDef.type] ?? 0;
  return 0;
}

function readValue(view: DataView, offset: number, type: string): number {
  switch (type) {
    case 'uint8_t': return view.getUint8(offset);
    case 'int8_t': return view.getInt8(offset);
    case 'uint16_t': return view.getUint16(offset, true);
    case 'int16_t': return view.getInt16(offset, true);
    case 'uint32_t': return view.getUint32(offset, true);
    case 'int32_t': return view.getInt32(offset, true);
    case 'float': return view.getFloat32(offset, true);
    case 'uint64_t': return Number(view.getBigUint64(offset, true));
    case 'int64_t': return Number(view.getBigInt64(offset, true));
    case 'double': return view.getFloat64(offset, true);
    default: return 0;
  }
}

interface DecodedArg {
  value: number;
  type: string;
  enumDef?: Px4EnumDef;
}

/**
 * Read the declared arguments out of EVENT's 40-byte payload, in order. A
 * truncated or malformed buffer stops the walk rather than throwing: a partly
 * rendered message beats no message at all.
 */
export function decodePx4EventArguments(entry: Px4EventEntry, args: Uint8Array): DecodedArg[] {
  const view = new DataView(args.buffer, args.byteOffset, args.byteLength);
  const decoded: DecodedArg[] = [];
  let offset = 0;

  for (const arg of entry.def.arguments ?? []) {
    const enumDef = resolveEnum(arg.type, entry);
    const baseType = enumDef ? enumDef.type : arg.type;
    const width = widthOf(arg.type, entry);
    if (width === 0 || offset + width > args.byteLength) break;
    decoded.push({ value: readValue(view, offset, baseType), type: baseType, enumDef });
    offset += width;
  }

  return decoded;
}

function formatEnumValue(value: number, enumDef: Px4EnumDef): string {
  if (enumDef.is_bitfield) {
    const set: string[] = [];
    for (const [rawBit, meta] of Object.entries(enumDef.entries)) {
      const bit = Number(rawBit);
      // eslint-disable-next-line no-bitwise
      if (bit !== 0 && (value & bit) === bit) {
        set.push(meta.description ?? meta.name ?? String(bit));
      }
    }
    if (set.length > 0) return set.join(', ');
    return enumDef.entries[String(value)]?.description ?? String(value);
  }
  const match = enumDef.entries[String(value)];
  return match?.description ?? match?.name ?? String(value);
}

function formatNumber(arg: DecodedArg, precision: number | null): string {
  if (precision !== null) return arg.value.toFixed(precision);
  if (arg.type === 'float' || arg.type === 'double') {
    // No precision asked for: keep it short but never lose an integer value.
    return Number.isInteger(arg.value) ? String(arg.value) : String(Number(arg.value.toFixed(3)));
  }
  return String(arg.value);
}

/** `\{`, `\}`, `\<`, `\>` are literal characters in a libevents template. */
function unescapeTemplate(text: string): string {
  return text.replace(/\\([{}<>\\])/g, '$1');
}

const PLACEHOLDER = /\{(\d+)(?::\.(\d+))?([a-zA-Z0-9_/]*)\}/g;

/**
 * Render an event's message template with its decoded arguments. Placeholders
 * that reference an argument the payload did not carry are left as-is, which
 * makes a truncated event visibly incomplete instead of silently wrong.
 */
export function formatPx4EventMessage(entry: Px4EventEntry, args: Uint8Array): string | null {
  const template = entry.def.message;
  if (!template) return null;

  const decoded = decodePx4EventArguments(entry, args);

  const rendered = template.replace(PLACEHOLDER, (whole, rawIndex: string, rawPrecision: string | undefined, rawUnit: string) => {
    const arg = decoded[Number(rawIndex) - 1];
    if (!arg) return whole;

    if (arg.enumDef) return formatEnumValue(arg.value, arg.enumDef);

    const precision = rawPrecision === undefined ? null : Number(rawPrecision);
    const value = formatNumber(arg, precision);
    const unit = rawUnit ? UNIT_LABELS[rawUnit] : undefined;
    return unit ? `${value} ${unit}` : value;
  });

  return unescapeTemplate(rendered).trim();
}

/**
 * PX4 packs two nibbles into EVENT.log_levels: internal (MSB) and external
 * (LSB). Only the external one is meant for the user, and it uses the same
 * scale as MAV_SEVERITY (0 Emergency .. 7 Debug). 8 (Protocol) and 9 (Disabled)
 * are not user-facing.
 */
export function px4EventSeverity(logLevels: number): number | null {
  // eslint-disable-next-line no-bitwise
  const external = logLevels & 0x0f;
  return external <= 7 ? external : null;
}
