// ecad/catalog.ts — the ScadGen virtual ECAD part catalog: every major
// microcontroller board, display ("screen"), and the peripherals that make a
// virtual circuit DO something in 3D space.
//
// Parts are declarative data. `scene.ts` turns a part into a procedural
// three.js model; `runtime.ts` executes firmware against the board's pin map;
// `sim.ts` wires parts together and drives the 3D objects (LED emissive,
// screen textures, servo horns). Nothing here needs a GPU — the catalog and
// the runtime are pure TS so they run in node tests, the desktop editor, and
// VR identically.
//
// Units: millimetres. Origin: board center on its top surface (z=0 top face).

export type PartCategory = "board" | "display" | "peripheral";

export type McuFamily =
  | "avr" // ATmega / ATtiny — true hex emulation (avr8js)
  | "avr32u4"
  | "rp2040"
  | "esp32"
  | "esp32s3"
  | "esp8266"
  | "stm32"
  | "imxrt" // Teensy 4.x
  | "nrf52"; // micro:bit v2

/**
 * How firmware executes for this board:
 * - "hex"     — real instruction-level emulation of compiled firmware
 *               (.hex upload); AVR boards via avr8js.
 * - "virtual" — ScadGen virtual firmware: an Arduino-flavored JS API whose
 *               setup/loop run against the board's real pin map. Every board
 *               supports this tier.
 */
export type RuntimeTier = "hex" | "virtual" | "rp2040" | "stm32f4" | "esp32";

export type PinFunction =
  | "gpio"
  | "pwm"
  | "adc"
  | "i2c-sda"
  | "i2c-scl"
  | "spi-mosi"
  | "spi-miso"
  | "spi-sck"
  | "spi-cs"
  | "uart-tx"
  | "uart-rx"
  | "gnd"
  | "vcc"
  | "vin"
  | "reset"
  | "nc"
  /** Two/three-terminal component lead: conducts like a real node. */
  | "passive";

export interface PartPin {
  /** Pin name as printed on the board silkscreen, e.g. "13", "A0", "GND". */
  name: string;
  fn: PinFunction;
  /** GPIO channel number the firmware layer addresses (Arduino numbering). */
  gpio?: number | undefined;
  /** AVR data-register port/bit for hex emulation (avr8js AVRIOPort). */
  avrPort?: "A" | "B" | "C" | "D" | undefined;
  avrBit?: number | undefined;
  /** I2C address when the pin belongs to a fixed-address peripheral chip. */
  i2cAddr?: number | undefined;
}

export interface BoardPart {
  id: string;
  name: string;
  category: "board";
  family: McuFamily;
  mcu: string;
  /** Board PCB outline (mm). */
  size: { w: number; h: number; t: number };
  pcbColor: string;
  /** USB connector footprint on the board edge (mm), null for bare MCUs. */
  usb?: {
    w: number;
    h: number;
    edge: "top" | "bottom" | "left" | "right";
  } | null;
  /** Physical pin header rows for the 3D model: position + pin names. */
  headers: {
    label: string;
    edge: "top" | "bottom" | "left" | "right";
    start: number; // mm along the edge from its negative end
    pitch: number; // usually 2.54
    pins: PartPin[];
  }[];
  /** Chips rendered as dark blocks (µC, USB-UART bridge, regulator). */
  chips: { name: string; x: number; y: number; w: number; h: number }[];
  tiers: RuntimeTier[];
  /** Firmware ids preloaded for this board (see firmware.ts). */
  firmware: string[];
  notes?: string;
}

export type DisplayDriver =
  | "ssd1306" // monochrome OLED, I2C 0x3C/0x3D — 128x64 / 128x32
  | "sh1106" // monochrome OLED, I2C, same command family
  | "st7735" // 160x128 color TFT, SPI
  | "ili9341" // 240x320 color TFT, SPI
  | "hd44780" // character LCD 16x2 (I2C backpack)
  | "max7219" // 8x8 LED matrix
  | "tm1637" // 4-digit 7-segment
  | "epaper"; // 2.13" monochrome e-ink 250x122

export interface DisplayPart {
  id: string;
  name: string;
  category: "display";
  driver: DisplayDriver;
  /** Pixel resolution of the panel. */
  res: { w: number; h: number };
  colors: 1 | 16 | 256; // monochrome / st7735-class / 256-class color depth
  iface: "i2c" | "spi" | "tm1637";
  i2cAddr?: number;
  /** Module PCB + visible glass area (mm). */
  size: { w: number; h: number; t: number };
  glass: { w: number; h: number; x: number; y: number };
  pcbColor: string;
  pins: PartPin[];
  firmware: string[];
}

export type PeripheralKind =
  | "led"
  | "rgbled"
  | "buzzer"
  | "servo"
  | "button"
  | "pot"
  | "rf-tx"
  | "rf-rx"
  | "resistor"
  | "capacitor"
  | "inductor"
  | "diode"
  | "transistor"
  | "mosfet"
  | "battery";

/**
 * Electrical model of a discrete component (see ecad/circuit.ts). A part with
 * this field is stamped into the nodal solver every tick; it is never decor.
 */
export interface ElectronicsSpec {
  device:
    | "resistor"
    | "capacitor"
    | "inductor"
    | "diode"
    | "led"
    | "battery"
    | "npn"
    | "mosfet";
  /** Ohms, farads, henries, volts, or forward/threshold volts. */
  value: number;
  /** Series resistance (diode/LED). */
  rOn?: number;
  /** Junction saturation current, A. */
  is?: number;
  /** Emission coefficient. */
  n?: number;
  /** Forward / reverse current gain (BJT). */
  bf?: number;
  br?: number;
  /** Early voltage, V (BJT). */
  vaf?: number;
  /** Reverse breakdown voltage, V (diode). */
  vbr?: number;
  /** Zero-bias junction capacitance, F. */
  cj?: number;
  /** MOSFET transconductance, A/V². */
  k?: number;
  /** MOSFET channel-length modulation, 1/V. */
  lambda?: number;
  /** Breakdown saturation current / coefficient (diode). */
  isZ?: number;
  nz?: number;
}

/**
 * In-world radio capability of a part (see ecad/radio.ts). The transport is
 * OOK level edges through space, so firmware owns the protocol above it.
 */
export type RadioCapability =
  | {
      role: "tx";
      /** Centre frequency, MHz. Only parts on the same channel link. */
      mhz: number;
      /** Conducted transmit power, dBm. */
      powerDbm: number;
      /** Antenna / enclosure / matching loss, dB. */
      lossDb?: number;
    }
  | {
      role: "rx";
      /** Centre frequency, MHz. Only parts on the same channel link. */
      mhz: number;
      /** Smallest signal this receiver can hear, dBm. */
      sensitivityDbm: number;
      /** Antenna / enclosure / matching loss, dB. */
      lossDb?: number;
    };

export interface PeripheralPart {
  id: string;
  name: string;
  category: "peripheral";
  kind: PeripheralKind;
  size: { w: number; h: number; t: number };
  color: string;
  pins: PartPin[];
  firmware: string[];
  /** Set on parts that transmit or receive through the in-world RF medium. */
  radio?: RadioCapability;
  /** Set on discrete electrical parts; the nodal solver stamps them. */
  electronics?: ElectronicsSpec;
}

export type EcadPart = BoardPart | DisplayPart | PeripheralPart;

// ---------------------------------------------------------------------------
// Pin shorthands
// ---------------------------------------------------------------------------

const g = (name: string, gpio: number, extra?: Partial<PartPin>): PartPin => ({
  name,
  fn: "gpio",
  gpio,
  ...extra,
});
const p = (
  name: string,
  gpio: number,
  avrPort: "A" | "B" | "C" | "D",
  avrBit: number,
): PartPin => ({
  name,
  fn: "gpio",
  gpio,
  avrPort,
  avrBit,
});
const pw = (
  name: string,
  gpio: number,
  avrPort: "A" | "B" | "C" | "D",
  avrBit: number,
): PartPin => ({
  name,
  fn: "pwm",
  gpio,
  avrPort,
  avrBit,
});
const pwr = (
  name: string,
  fn: "gnd" | "vcc" | "vin" | "reset" = "gnd",
): PartPin => ({ name, fn });
const a = (
  name: string,
  gpio: number,
  avrPort: "A" | "B" | "C" | "D",
  avrBit: number,
): PartPin => ({
  name,
  fn: "adc",
  gpio,
  avrPort,
  avrBit,
});
/** Component lead (resistor, coil, transistor…): wires to any electrical pin. */
const el = (name: string): PartPin => ({ name, fn: "passive" });

/** Digital header row for AVR boards (D0..D13 with fixed extra functions). */
function avrDigital(
  names: string[],
  gpios: number[],
  port: "A" | "B" | "C" | "D",
  baseBit: number,
  extra: Record<string, Partial<PartPin>> = {},
): PartPin[] {
  return names.map((name, i) => ({
    name,
    fn: "gpio",
    gpio: gpios[i],
    avrPort: port,
    avrBit: baseBit + i,
    ...(extra[name] ?? {}),
  }));
}

// ---------------------------------------------------------------------------
// Boards — every major hobbyist/professional microcontroller dev board.
// Pin maps are the Arduino-programmer-visible logical pins; AVR boards carry
// (port,bit) so compiled hex drives the same virtual pins.
// ---------------------------------------------------------------------------

const unoGpios = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
// ATmega328P port truth: D0-D7 = PD0-PD7, D8-D13 = PB0-PB5 (D13 = PB5 LED)
const unoDigital: PartPin[] = [
  ...avrDigital(
    ["0", "1", "2", "3", "4", "5", "6", "7"],
    [0, 1, 2, 3, 4, 5, 6, 7],
    "D",
    0,
    {
      "0": { fn: "uart-rx" },
      "1": { fn: "uart-tx" },
      "3": { fn: "pwm" },
      "5": { fn: "pwm" },
      "6": { fn: "pwm" },
    },
  ),
  ...avrDigital(
    ["8", "9", "10", "11", "12", "13"],
    [8, 9, 10, 11, 12, 13],
    "B",
    0,
    {
      "9": { fn: "pwm" },
      "10": { fn: "pwm" },
      "11": { fn: "pwm" },
    },
  ),
];
const unoAnalog: PartPin[] = (
  ["A0", "A1", "A2", "A3", "A4", "A5"] as const
).map((n, i) => ({
  name: n,
  fn: "adc" as const,
  gpio: 14 + i,
  avrPort: "C" as const,
  avrBit: i,
  ...(i === 4 ? { fn: "i2c-sda" as const } : {}),
  ...(i === 5 ? { fn: "i2c-scl" as const } : {}),
}));

const nanoDigital: PartPin[] = unoDigital.map((pin) => ({ ...pin }));
const nanoAnalog: PartPin[] = unoAnalog.map((pin) => ({ ...pin }));

const megaDigitalNames = Array.from({ length: 54 }, (_, i) => String(i));
const megaDigital: PartPin[] = megaDigitalNames.map((name, i) => ({
  name,
  fn: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46].includes(i)
    ? ("pwm" as const)
    : ("gpio" as const),
  gpio: i,
  ...(i === 0 ? { fn: "uart-rx" as const } : {}),
  ...(i === 1 ? { fn: "uart-tx" as const } : {}),
  ...(i === 20 ? { fn: "i2c-sda" as const } : {}),
  ...(i === 21 ? { fn: "i2c-scl" as const } : {}),
}));
const megaAnalog: PartPin[] = (
  [
    "A0",
    "A1",
    "A2",
    "A3",
    "A4",
    "A5",
    "A6",
    "A7",
    "A8",
    "A9",
    "A10",
    "A11",
    "A12",
    "A13",
    "A14",
    "A15",
  ] as const
).map((n, i) => ({ name: n, fn: "adc" as const, gpio: 54 + i }));

const esp8266Left: Record<string, number> = {
  A0: 17,
  D0: 16,
  D5: 14,
  D6: 12,
  D7: 13,
  D8: 15,
};
const esp8266Right: Record<string, number> = {
  D4: 2,
  D3: 0,
  D2: 4,
  D1: 5,
  RX: 3,
  TX: 1,
};
const esp8266Pins: PartPin[] = [
  ...["A0", "D0", "D5", "D6", "D7", "D8", "3V3", "GND"].map((n): PartPin => {
    if (n === "3V3") return { name: n, fn: "vcc" };
    if (n === "GND") return { name: n, fn: "gnd" };
    return { name: n, fn: "gpio", gpio: esp8266Left[n] };
  }),
  ...["D4", "D3", "D2", "D1", "RX", "TX", "GND", "VIN"].map((n): PartPin => {
    if (n === "GND") return { name: n, fn: "gnd" };
    if (n === "VIN") return { name: n, fn: "vin" };
    if (n === "RX") return { name: n, fn: "uart-rx", gpio: esp8266Right[n] };
    if (n === "TX") return { name: n, fn: "uart-tx", gpio: esp8266Right[n] };
    return { name: n, fn: "gpio", gpio: esp8266Right[n] };
  }),
];

const esp32PinNames = [
  "EN",
  "VP",
  "VN",
  "34",
  "35",
  "32",
  "33",
  "25",
  "26",
  "27",
  "14",
  "12",
  "GND",
  "13",
  "D2",
  "D3",
  "CMD",
  "5V",
  "GND",
  "3V3",
  "3V3",
  "GND",
  "15",
  "2",
  "0",
  "4",
  "16",
  "17",
  "5",
  "18",
  "19",
  "NC",
  "21",
  "RX0",
  "TX0",
  "22",
  "23",
];
const esp32Pins: PartPin[] = esp32PinNames.map((name, i) => {
  const base: PartPin = {
    name,
    fn: "gpio",
    gpio: /^\d+$/.test(name) ? Number(name) : undefined,
  };
  if (name === "21") return { ...base, fn: "i2c-sda" };
  if (name === "22") return { ...base, fn: "i2c-scl" };
  if (name === "RX0") return { ...base, fn: "uart-rx" };
  if (name === "TX0") return { ...base, fn: "uart-tx" };
  if (name === "GND") return { ...base, fn: "gnd" };
  if (name === "3V3") return { ...base, fn: "vcc" };
  if (name === "5V") return { ...base, fn: "vin" };
  if (name === "EN") return { ...base, fn: "reset" };
  return base;
});

const picoPinNames: Record<number, [string, PinFunction, number | undefined]> =
  {
    1: ["GP0", "gpio", 0],
    2: ["GP1", "gpio", 1],
    3: ["GND", "gnd", undefined],
    4: ["GP2", "gpio", 2],
    5: ["GP3", "gpio", 3],
    6: ["GP4", "i2c-sda", 4],
    7: ["GP5", "i2c-scl", 5],
    8: ["GND", "gnd", undefined],
    9: ["GP6", "gpio", 6],
    10: ["GP7", "gpio", 7],
    11: ["GP8", "gpio", 8],
    12: ["GP9", "gpio", 9],
    13: ["GND", "gnd", undefined],
    14: ["GP10", "gpio", 10],
    15: ["GP11", "gpio", 11],
    16: ["GP12", "gpio", 12],
    17: ["GP13", "gpio", 13],
    18: ["GND", "gnd", undefined],
    19: ["GP14", "gpio", 14],
    20: ["GP15", "gpio", 15],
    21: ["GP16", "gpio", 16],
    22: ["GP17", "gpio", 17],
    23: ["GND", "gnd", undefined],
    24: ["GP18", "gpio", 18],
    25: ["GP19", "gpio", 19],
    26: ["GP20", "i2c-sda", 20],
    27: ["GP21", "i2c-scl", 21],
    28: ["GND", "gnd", undefined],
    29: ["GP22", "gpio", 22],
    30: ["RUN", "reset", undefined],
    31: ["GP26", "adc", 26],
    32: ["GP27", "adc", 27],
    33: ["AGND", "gnd", undefined],
    34: ["GP28", "adc", 28],
    35: ["ADC_VREF", "vcc", undefined],
    36: ["3V3", "vcc", undefined],
    37: ["3V3_EN", "vcc", undefined],
    38: ["GND", "gnd", undefined],
    39: ["VSYS", "vin", undefined],
    40: ["VBUS", "vin", undefined],
  };

const picoPins: PartPin[] = [
  ...Array.from({ length: 40 }, (_, i) => {
    const entry = picoPinNames[i + 1];
    if (!entry) return { name: `NC${i}`, fn: "nc" as const } as PartPin;
    const [name, fn, gpio] = entry;
    return { name, fn, gpio } as PartPin;
  }),
  // onboard LED (not on the header, but addressable by firmware like Arduino D13)
  { name: "GP25", fn: "gpio", gpio: 25 },
];

const bluePillPins: PartPin[] = [
  ...[
    "VBAT",
    "PC13",
    "PC14",
    "PC15",
    "PA0",
    "PA1",
    "PA2",
    "PA3",
    "PA4",
    "PA5",
    "PA6",
    "PA7",
    "PB0",
    "PB1",
    "PB2",
    "PB10",
  ].map((name) => ({ name, fn: "gpio" as const, gpio: undefined })),
  pwr("3V3", "vcc"),
  pwr("GND"),
  pwr("5V", "vin"),
  ...[
    "PB9",
    "PB8",
    "PB7",
    "PB6",
    "PB5",
    "PB4",
    "PB3",
    "PA15",
    "PA12",
    "PA11",
    "PA10",
    "PA9",
    "PA8",
    "PB15",
    "PB14",
    "PB13",
    "PB12",
  ].map((name) => ({ name, fn: "gpio" as const, gpio: undefined })),
];

const teensyPins: PartPin[] = [
  pwr("GND"),
  ...Array.from({ length: 13 }, (_, i) => ({
    name: String(i),
    fn: "gpio" as const,
    gpio: i,
  })),
  pwr("3V3", "vcc"),
  ...Array.from({ length: 11 }, (_, i) => ({
    name: String(i + 13),
    fn: "gpio" as const,
    gpio: i + 13,
  })),
  pwr("VIN", "vin"),
  pwr("GND"),
];

const microbitPins: PartPin[] = [
  pwr("3V3", "vcc"),
  ...Array.from({ length: 21 }, (_, i) => ({
    name: `P${i}`,
    fn: (i === 3
      ? "gnd"
      : i === 19
        ? "i2c-scl"
        : i === 20
          ? "i2c-sda"
          : "gpio") as PinFunction,
    gpio: 20 - i, // micro:bit edge P0..P20
  })),
  pwr("GND"),
];

/** Black Pill F411CE: 40-pin DIP footprint, PC13 LED, USART1 on PA9/PA10. */
const blackPillPins: PartPin[] = [
  ...Array.from({ length: 16 }, (_, i) =>
    g(`PA${i}`, i, i <= 7 ? { fn: "adc" } : {}),
  ),
  g("PB0", 16, { fn: "adc" }),
  g("PB1", 17, { fn: "adc" }),
  g("PB2", 18),
  g("PB3", 19),
  g("PB4", 20),
  g("PB5", 21),
  g("PB6", 22, { fn: "i2c-sda" }),
  g("PB7", 23, { fn: "i2c-scl" }),
  g("PB8", 24),
  g("PB9", 25),
  g("PB10", 26),
  g("PB12", 27),
  g("PB13", 28, { fn: "spi-sck" }),
  g("PB14", 29, { fn: "spi-miso" }),
  g("PB15", 30, { fn: "spi-mosi" }),
  g("PC13", 31),
  g("PC14", 32),
  g("PC15", 33),
  g("5V", 34, { fn: "vcc" }),
  g("GND", 35, { fn: "gnd" }),
  g("3V3", 36, { fn: "vcc" }),
  g("GND", 37, { fn: "gnd" }),
  g("PA9", 38, { fn: "uart-tx" }),
  g("PA10", 39, { fn: "uart-rx" }),
];

const boards: BoardPart[] = [
  {
    id: "arduino-uno",
    name: "Arduino Uno R3",
    category: "board",
    family: "avr",
    mcu: "ATmega328P",
    size: { w: 53.3, h: 68.6, t: 1.6 },
    pcbColor: "#0b7a53",
    usb: { w: 12, h: 11, edge: "top" },
    headers: [
      {
        label: "DIGITAL",
        edge: "right",
        start: 8,
        pitch: 2.54,
        pins: unoDigital,
      },
      {
        label: "POWER",
        edge: "left",
        start: 8,
        pitch: 2.54,
        pins: [
          pwr("NC"),
          pwr("IOREF", "vcc"),
          pwr("RESET", "reset"),
          pwr("3V3", "vcc"),
          pwr("5V", "vin"),
          pwr("GND"),
          pwr("GND"),
          pwr("VIN", "vin"),
        ],
      },
      {
        label: "ANALOG",
        edge: "left",
        start: 34,
        pitch: 2.54,
        pins: unoAnalog,
      },
    ],
    chips: [
      { name: "ATmega328P", x: 14, y: -12, w: 10, h: 30 },
      { name: "ATmega16U2", x: 34, y: 16, w: 9, h: 9 },
    ],
    tiers: ["hex", "virtual"],
    firmware: ["blink", "hello-serial", "button-led", "hello-oled"],
  },
  {
    id: "arduino-nano",
    name: "Arduino Nano",
    category: "board",
    family: "avr",
    mcu: "ATmega328P",
    size: { w: 18, h: 45, t: 1.6 },
    pcbColor: "#0b7a53",
    usb: { w: 7.5, h: 8, edge: "top" },
    headers: [
      {
        label: "L",
        edge: "left",
        start: 4,
        pitch: 2.54,
        pins: [...nanoAnalog, ...nanoDigital.slice(0, 7)],
      },
      {
        label: "R",
        edge: "right",
        start: 4,
        pitch: 2.54,
        pins: [
          pwr("VIN", "vin"),
          pwr("GND"),
          pwr("RST", "reset"),
          pwr("5V", "vin"),
          pwr("A7"),
          pwr("A6"),
          pwr("5V", "vin"),
          pwr("A6"),
          ...nanoDigital.slice(7),
        ],
      },
    ],
    chips: [{ name: "ATmega328P", x: 0, y: -8, w: 9, h: 9 }],
    tiers: ["hex", "virtual"],
    firmware: ["blink", "hello-serial", "button-led", "hello-oled"],
  },
  {
    id: "arduino-mega",
    name: "Arduino Mega 2560",
    category: "board",
    family: "avr",
    mcu: "ATmega2560",
    size: { w: 53.3, h: 101.5, t: 1.6 },
    pcbColor: "#0b7a53",
    usb: { w: 12, h: 11, edge: "top" },
    headers: [
      {
        label: "DIGITAL",
        edge: "right",
        start: 8,
        pitch: 2.54,
        pins: megaDigital.slice(0, 30),
      },
      {
        label: "DIGITAL-H",
        edge: "right",
        start: 90,
        pitch: 2.54,
        pins: megaDigital.slice(30),
      },
      {
        label: "ANALOG",
        edge: "bottom",
        start: 12,
        pitch: 2.54,
        pins: megaAnalog,
      },
      {
        label: "POWER",
        edge: "left",
        start: 8,
        pitch: 2.54,
        pins: [
          pwr("NC"),
          pwr("IOREF", "vcc"),
          pwr("RESET", "reset"),
          pwr("3V3", "vcc"),
          pwr("5V", "vin"),
          pwr("GND"),
          pwr("GND"),
          pwr("VIN", "vin"),
        ],
      },
    ],
    chips: [{ name: "ATmega2560", x: 12, y: -30, w: 12, h: 12 }],
    tiers: ["hex", "virtual"],
    firmware: ["blink", "hello-serial", "hello-oled", "blink-hex-mega"],
    notes:
      "ATmega2560 .hex runs in-app: 256 KB flash, 8 KB SRAM, 22-bit PC, ports A-L, timers 0-5, USART0-3. In-browser C++ still targets 328P; build Mega firmware in Arduino IDE and upload the .hex.",
  },
  {
    id: "arduino-leonardo",
    name: "Arduino Leonardo",
    category: "board",
    family: "avr32u4",
    mcu: "ATmega32U4",
    size: { w: 53.3, h: 68.6, t: 1.6 },
    pcbColor: "#0b7a53",
    usb: { w: 12, h: 11, edge: "top" },
    headers: [
      {
        label: "DIGITAL",
        edge: "right",
        start: 8,
        pitch: 2.54,
        pins: Array.from(
          { length: 14 },
          (_, i) =>
            ({
              name: String(i),
              fn: (i >= 3 && i <= 6) || (i >= 9 && i <= 13) ? "pwm" : "gpio",
              gpio: i,
            }) as PartPin,
        ),
      },
      {
        label: "ANALOG",
        edge: "left",
        start: 34,
        pitch: 2.54,
        pins: (["A0", "A1", "A2", "A3", "A4", "A5"] as const).map((n, i) => ({
          name: n,
          fn: "adc" as const,
          gpio: 18 + i,
        })),
      },
      {
        label: "POWER",
        edge: "left",
        start: 8,
        pitch: 2.54,
        pins: [
          pwr("NC"),
          pwr("IOREF", "vcc"),
          pwr("RESET", "reset"),
          pwr("3V3", "vcc"),
          pwr("5V", "vin"),
          pwr("GND"),
          pwr("GND"),
          pwr("VIN", "vin"),
        ],
      },
    ],
    chips: [{ name: "ATmega32U4", x: 30, y: -12, w: 10, h: 10 }],
    tiers: ["hex", "virtual"],
    firmware: ["blink", "hello-serial", "button-led", "blink-hex-leonardo"],
    notes:
      "ATmega32U4 .hex runs in-app (timers 0/1/3, USART1, ports B-F). `Serial` is USB CDC and is not emulated — use `Serial1`.",
  },
  {
    id: "esp32-devkit",
    name: "ESP32 DevKit V1",
    category: "board",
    family: "esp32",
    mcu: "ESP32-WROOM-32",
    size: { w: 25.4, h: 48.3, t: 1.6 },
    pcbColor: "#1a3a6b",
    usb: { w: 7.5, h: 8, edge: "bottom" },
    headers: [
      {
        label: "L",
        edge: "left",
        start: 4,
        pitch: 2.54,
        pins: esp32Pins.slice(0, 20),
      },
      {
        label: "R",
        edge: "right",
        start: 4,
        pitch: 2.54,
        pins: esp32Pins.slice(20),
      },
    ],
    chips: [{ name: "ESP32-WROOM-32", x: 0, y: 8, w: 18, h: 25.5 }],
    tiers: ["esp32", "virtual"],
    firmware: ["blink", "wifi-scan", "hello-oled", "servo-sweep"],
    notes:
      "Uploaded merged or combined ESP32 flash image (bootloader + partition table + app) runs on the in-app Xtensa LX6 (esp32sim, MIT) through Espressif's mask ROM. GPIO output edges drive wired LEDs, servos and buzzers; inputs from buttons and pots reach the pads. A virtual access point 'esp32sim' (WPA2, passphrase esp32sim-pass) is attached for Wi-Fi; association with the stock Espressif blob is not yet validated, and there is no NAT, so the guest reaches its own subnet only. Bluetooth runs when the application ELF is attached, because the VHCI controller needs its symbol table. The S3 (LX7) and ESP8266 (L106) stay verified-image only.",
  },
  {
    id: "esp32-s3",
    name: "ESP32-S3 DevKitC",
    category: "board",
    family: "esp32s3",
    mcu: "ESP32-S3-WROOM-1",
    size: { w: 25.4, h: 54, t: 1.6 },
    pcbColor: "#1a3a6b",
    usb: { w: 7.5, h: 8, edge: "bottom" },
    headers: [
      {
        label: "L",
        edge: "left",
        start: 4,
        pitch: 2.54,
        pins: esp32Pins.slice(0, 20),
      },
      {
        label: "R",
        edge: "right",
        start: 4,
        pitch: 2.54,
        pins: esp32Pins.slice(20),
      },
    ],
    chips: [{ name: "ESP32-S3-WROOM-1", x: 0, y: 8, w: 18, h: 25.5 }],
    tiers: ["virtual"],
    firmware: ["blink", "hello-oled"],
  },
  {
    id: "esp8266-nodemcu",
    name: "NodeMCU ESP8266",
    category: "board",
    family: "esp8266",
    mcu: "ESP8266EX",
    size: { w: 24.8, h: 48.3, t: 1.6 },
    pcbColor: "#1a3a6b",
    usb: { w: 7.5, h: 8, edge: "bottom" },
    headers: [
      {
        label: "L",
        edge: "left",
        start: 4,
        pitch: 2.54,
        pins: esp8266Pins.slice(0, 8),
      },
      {
        label: "R",
        edge: "right",
        start: 4,
        pitch: 2.54,
        pins: esp8266Pins.slice(8),
      },
    ],
    chips: [{ name: "ESP-12E", x: 0, y: 6, w: 16, h: 24 }],
    tiers: ["virtual"],
    firmware: ["blink", "wifi-scan", "hello-oled"],
  },
  {
    id: "rpi-pico",
    name: "Raspberry Pi Pico",
    category: "board",
    family: "rp2040",
    mcu: "RP2040",
    size: { w: 21, h: 51, t: 1.0 },
    pcbColor: "#1f6f50",
    usb: { w: 8, h: 7, edge: "top" },
    headers: [
      {
        label: "L",
        edge: "left",
        start: 3,
        pitch: 2.54,
        pins: picoPins.slice(0, 20),
      },
      {
        label: "R",
        edge: "right",
        start: 3,
        pitch: 2.54,
        pins: picoPins.slice(20),
      },
    ],
    chips: [{ name: "RP2040", x: 0, y: 0, w: 12, h: 12 }],
    tiers: ["rp2040", "virtual"],
    firmware: [
      "blink",
      "hello-serial",
      "button-led",
      "hello-oled",
      "servo-sweep",
    ],
    notes:
      "Uploaded .uf2 / raw flash images run on the in-app RP2040 (Cortex-M0+, GPIO, UART0). Boot-vector images only: the mask ROM is not redistributable, so firmware that calls ROM functions may not finish booting.",
  },
  {
    id: "rpi-pico-w",
    name: "Raspberry Pi Pico W",
    category: "board",
    family: "rp2040",
    mcu: "RP2040 + CYW43439",
    size: { w: 21, h: 51, t: 1.0 },
    pcbColor: "#1f6f50",
    usb: { w: 8, h: 7, edge: "top" },
    headers: [
      {
        label: "L",
        edge: "left",
        start: 3,
        pitch: 2.54,
        pins: picoPins.slice(0, 20),
      },
      {
        label: "R",
        edge: "right",
        start: 3,
        pitch: 2.54,
        pins: picoPins.slice(20),
      },
    ],
    chips: [{ name: "RP2040", x: 0, y: 0, w: 12, h: 12 }],
    tiers: ["rp2040", "virtual"],
    firmware: ["blink", "wifi-scan", "hello-oled"],
    notes:
      "Same RP2040 core as the Pico for uploaded .uf2 / raw images; the CYW43439 wireless side is not modelled.",
  },
  {
    id: "stm32-bluepill",
    name: "STM32 Blue Pill",
    category: "board",
    family: "stm32",
    mcu: "STM32F103C8T6",
    size: { w: 22.9, h: 53.3, t: 1.6 },
    pcbColor: "#14418f",
    usb: null,
    headers: [
      {
        label: "L",
        edge: "left",
        start: 3,
        pitch: 2.54,
        pins: bluePillPins.slice(0, 20),
      },
      {
        label: "R",
        edge: "right",
        start: 3,
        pitch: 2.54,
        pins: bluePillPins.slice(20),
      },
    ],
    chips: [{ name: "STM32F103C8T6", x: 0, y: 0, w: 9, h: 9 }],
    tiers: ["virtual"],
    firmware: ["blink", "hello-serial"],
  },
  {
    id: "stm32f4-blackpill",
    name: "STM32F4 Black Pill",
    category: "board",
    family: "stm32",
    mcu: "STM32F411CEU6",
    size: { w: 22.9, h: 53.3, t: 1.6 },
    pcbColor: "#101418",
    usb: { w: 9, h: 7.5, edge: "top" },
    headers: [
      {
        label: "L",
        edge: "left",
        start: 3,
        pitch: 2.54,
        pins: blackPillPins.slice(0, 20),
      },
      {
        label: "R",
        edge: "right",
        start: 3,
        pitch: 2.54,
        pins: blackPillPins.slice(20),
      },
    ],
    chips: [{ name: "STM32F411CEU6", x: 0, y: 0, w: 7, h: 7 }],
    tiers: ["stm32f4", "virtual"],
    firmware: ["blink", "hello-serial", "button-led"],
    notes:
      "Uploaded .bin / .hex / .elf firmware runs on the in-app Cortex-M4 core (GPIO, USART, timers, SPI, I2C, ADC/DAC, DMA). F401/F407/F407VE/F429 images boot on their matching chip model; the F103 Blue Pill is a different core and stays verified-image only.",
  },
  {
    id: "teensy-40",
    name: "Teensy 4.0",
    category: "board",
    family: "imxrt",
    mcu: "i.MX RT1062",
    size: { w: 17.8, h: 35.6, t: 1.6 },
    pcbColor: "#0b7a53",
    usb: { w: 7.5, h: 6, edge: "top" },
    headers: [
      {
        label: "L",
        edge: "left",
        start: 3,
        pitch: 2.54,
        pins: teensyPins.slice(0, 12),
      },
      {
        label: "R",
        edge: "right",
        start: 3,
        pitch: 2.54,
        pins: teensyPins.slice(12),
      },
    ],
    chips: [{ name: "MIMXRT1062", x: 0, y: -4, w: 10, h: 10 }],
    tiers: ["virtual"],
    firmware: ["blink", "hello-serial"],
  },
  {
    id: "attiny85",
    name: "ATtiny85 (DIP-8)",
    category: "board",
    family: "avr",
    mcu: "ATtiny85",
    size: { w: 9.5, h: 9.5, t: 3.3 },
    pcbColor: "#0b7a53",
    usb: null,
    headers: [
      {
        label: "PINS",
        edge: "left",
        start: 2,
        pitch: 2.54,
        pins: [
          p("PB5", 5, "B", 5),
          p("PB3", 3, "B", 3),
          p("PB4", 4, "B", 4),
          pwr("GND"),
        ],
      },
      {
        label: "PINS2",
        edge: "right",
        start: 2,
        pitch: 2.54,
        pins: [
          pwr("VCC", "vcc"),
          p("PB2", 2, "B", 2),
          p("PB1", 1, "B", 1),
          p("PB0", 0, "B", 0),
        ],
      },
    ],
    chips: [],
    tiers: ["hex", "virtual"],
    firmware: ["blink", "blink-hex-attiny85"],
    notes:
      "Bare 8-pin MCU at 8 MHz. .hex runs in-app (8 KB flash, PORTB, Timer0, ATtiny Timer1); there is no USART, so serial stays empty.",
  },
  {
    id: "microbit-v2",
    name: "BBC micro:bit v2",
    category: "board",
    family: "nrf52",
    mcu: "nRF52833",
    size: { w: 52, h: 42, t: 1.6 },
    pcbColor: "#14418f",
    usb: { w: 9, h: 7, edge: "top" },
    headers: [
      {
        label: "EDGE",
        edge: "bottom",
        start: 4,
        pitch: 1.27,
        pins: microbitPins,
      },
    ],
    chips: [
      { name: "nRF52833", x: 0, y: 6, w: 8, h: 8 },
      { name: "5x5 LED", x: 0, y: -8, w: 12, h: 12 },
    ],
    tiers: ["virtual"],
    firmware: ["blink", "hello-serial"],
  },
  {
    id: "arduino-due",
    name: "Arduino Due",
    category: "board",
    family: "stm32", // SAM3X8E is ARM Cortex-M3; closest family bucket for tiering
    mcu: "AT91SAM3X8E",
    size: { w: 53.3, h: 101.5, t: 1.6 },
    pcbColor: "#5a5a3a",
    usb: { w: 12, h: 11, edge: "top" },
    headers: [
      {
        label: "DIGITAL",
        edge: "right",
        start: 8,
        pitch: 2.54,
        pins: Array.from(
          { length: 44 },
          (_, i) =>
            ({ name: String(i + 22), fn: "gpio", gpio: i + 22 }) as PartPin,
        ),
      },
      {
        label: "ANALOG",
        edge: "left",
        start: 34,
        pitch: 2.54,
        pins: (
          [
            "A0",
            "A1",
            "A2",
            "A3",
            "A4",
            "A5",
            "A6",
            "A7",
            "A8",
            "A9",
            "A10",
            "A11",
          ] as const
        ).map((n, i) => ({ name: n, fn: "adc" as const, gpio: 54 + i })),
      },
      {
        label: "POWER",
        edge: "left",
        start: 8,
        pitch: 2.54,
        pins: [
          pwr("NC"),
          pwr("IOREF", "vcc"),
          pwr("RESET", "reset"),
          pwr("3V3", "vcc"),
          pwr("5V", "vin"),
          pwr("GND"),
          pwr("GND"),
          pwr("VIN", "vin"),
        ],
      },
    ],
    chips: [{ name: "SAM3X8E", x: 12, y: -30, w: 12, h: 12 }],
    tiers: ["virtual"],
    firmware: ["blink", "hello-serial"],
  },
];

// ---------------------------------------------------------------------------
// Displays — the "screens" side of ECAD. Each one renders a live canvas
// texture in 3D driven by the running firmware.
// ---------------------------------------------------------------------------

const displays: DisplayPart[] = [
  {
    id: "ssd1306-128x64",
    name: 'SSD1306 OLED 0.96" 128x64',
    category: "display",
    driver: "ssd1306",
    res: { w: 128, h: 64 },
    colors: 1,
    iface: "i2c",
    i2cAddr: 0x3c,
    size: { w: 27, h: 27.3, t: 1.6 },
    glass: { w: 21.7, h: 10.9, x: 0, y: 2 },
    pcbColor: "#0b1a3a",
    pins: [
      pwr("GND"),
      pwr("VCC", "vcc"),
      { name: "SCL", fn: "i2c-scl" },
      { name: "SDA", fn: "i2c-sda" },
    ],
    firmware: ["hello-oled"],
  },
  {
    id: "ssd1306-128x32",
    name: 'SSD1306 OLED 0.91" 128x32',
    category: "display",
    driver: "ssd1306",
    res: { w: 128, h: 32 },
    colors: 1,
    iface: "i2c",
    i2cAddr: 0x3c,
    size: { w: 30, h: 11.5, t: 1.6 },
    glass: { w: 25, h: 6.5, x: 0, y: 0 },
    pcbColor: "#0b1a3a",
    pins: [
      pwr("GND"),
      pwr("VCC", "vcc"),
      { name: "SCL", fn: "i2c-scl" },
      { name: "SDA", fn: "i2c-sda" },
    ],
    firmware: ["hello-oled"],
  },
  {
    id: "sh1106-128x64",
    name: 'SH1106 OLED 1.3" 128x64',
    category: "display",
    driver: "sh1106",
    res: { w: 128, h: 64 },
    colors: 1,
    iface: "i2c",
    i2cAddr: 0x3c,
    size: { w: 33.5, h: 33, t: 1.6 },
    glass: { w: 29.4, h: 14.7, x: 0, y: 2 },
    pcbColor: "#0b1a3a",
    pins: [
      pwr("GND"),
      pwr("VCC", "vcc"),
      { name: "SCL", fn: "i2c-scl" },
      { name: "SDA", fn: "i2c-sda" },
    ],
    firmware: ["hello-oled"],
  },
  {
    id: "st7735-160x128",
    name: 'ST7735 TFT 1.8" 160x128',
    category: "display",
    driver: "st7735",
    res: { w: 160, h: 128 },
    colors: 16,
    iface: "spi",
    size: { w: 34, h: 55, t: 1.6 },
    glass: { w: 28, h: 21.9, x: 0, y: -6 },
    pcbColor: "#0b1a3a",
    pins: [
      pwr("VCC", "vcc"),
      pwr("GND"),
      { name: "CS", fn: "spi-cs" },
      { name: "RESET", fn: "gpio" },
      { name: "A0/DC", fn: "gpio" },
      { name: "SDA/MOSI", fn: "spi-mosi" },
      { name: "SCK", fn: "spi-sck" },
      { name: "LED", fn: "vcc" },
    ],
    firmware: ["hello-tft"],
  },
  {
    id: "ili9341-240x320",
    name: 'ILI9341 TFT 2.4" 240x320',
    category: "display",
    driver: "ili9341",
    res: { w: 240, h: 320 },
    colors: 256,
    iface: "spi",
    size: { w: 42.7, h: 60.1, t: 1.6 },
    glass: { w: 36.7, h: 48.9, x: 0, y: -2 },
    pcbColor: "#0b1a3a",
    pins: [
      pwr("VCC", "vcc"),
      pwr("GND"),
      { name: "CS", fn: "spi-cs" },
      { name: "RESET", fn: "gpio" },
      { name: "DC", fn: "gpio" },
      { name: "MOSI", fn: "spi-mosi" },
      { name: "SCK", fn: "spi-sck" },
      { name: "LED", fn: "vcc" },
      { name: "MISO", fn: "spi-miso" },
    ],
    firmware: ["hello-tft"],
  },
  {
    id: "lcd1602",
    name: "16x2 Character LCD (I2C)",
    category: "display",
    driver: "hd44780",
    res: { w: 16, h: 2 }, // character cells
    colors: 1,
    iface: "i2c",
    i2cAddr: 0x27,
    size: { w: 80, h: 36, t: 1.6 },
    glass: { w: 64.5, h: 13.8, x: 0, y: -4 },
    pcbColor: "#0a4d2e",
    pins: [
      pwr("GND"),
      pwr("VCC", "vcc"),
      { name: "SDA", fn: "i2c-sda" },
      { name: "SCL", fn: "i2c-scl" },
    ],
    firmware: ["hello-lcd"],
  },
  {
    id: "max7219-8x8",
    name: "MAX7219 8x8 LED Matrix",
    category: "display",
    driver: "max7219",
    res: { w: 8, h: 8 },
    colors: 1,
    iface: "spi",
    size: { w: 32, h: 32, t: 1.6 },
    glass: { w: 24, h: 24, x: 0, y: 0 },
    pcbColor: "#0b1a3a",
    pins: [
      pwr("VCC", "vcc"),
      pwr("GND"),
      { name: "DIN", fn: "spi-mosi" },
      { name: "CS", fn: "spi-cs" },
      { name: "CLK", fn: "spi-sck" },
    ],
    firmware: ["hello-matrix"],
  },
  {
    id: "tm1637-4digit",
    name: "TM1637 4-Digit 7-Segment",
    category: "display",
    driver: "tm1637",
    res: { w: 4, h: 1 },
    colors: 1,
    iface: "tm1637",
    size: { w: 42, h: 15, t: 1.6 },
    glass: { w: 30, h: 9, x: 0, y: 0 },
    pcbColor: "#0b1a3a",
    pins: [g("CLK", 0), g("DIO", 1), pwr("VCC", "vcc"), pwr("GND")],
    firmware: ["hello-7seg"],
  },
  {
    id: "epaper-213",
    name: 'E-Paper 2.13" 250x122',
    category: "display",
    driver: "epaper",
    res: { w: 250, h: 122 },
    colors: 1,
    iface: "spi",
    size: { w: 30.4, h: 42.7, t: 1.6 },
    glass: { w: 23.7, h: 23.7, x: 0, y: -4 },
    pcbColor: "#0b1a3a",
    pins: [
      pwr("VCC", "vcc"),
      pwr("GND"),
      { name: "DIN", fn: "spi-mosi" },
      { name: "CLK", fn: "spi-sck" },
      { name: "CS", fn: "spi-cs" },
      { name: "DC", fn: "gpio" },
      { name: "RST", fn: "gpio" },
      { name: "BUSY", fn: "gpio" },
    ],
    firmware: ["hello-epaper"],
  },
];

// ---------------------------------------------------------------------------
// Peripherals — what firmware actually ACTS ON in 3D space.
// ---------------------------------------------------------------------------

const peripherals: PeripheralPart[] = [
  {
    id: "led-red",
    name: "LED (red)",
    category: "peripheral",
    kind: "led",
    size: { w: 5, h: 5, t: 8 },
    color: "#ff2222",
    pins: [g("A", 0), g("K", 1)],
    firmware: ["blink"],
    electronics: {
      device: "led",
      value: 1.8,
      is: 8.4e-16,
      n: 2,
      rOn: 10,
      cj: 1e-12,
    },
  },
  {
    id: "led-green",
    name: "LED (green)",
    category: "peripheral",
    kind: "led",
    size: { w: 5, h: 5, t: 8 },
    color: "#22ff44",
    pins: [g("A", 0), g("K", 1)],
    firmware: ["blink"],
    electronics: {
      device: "led",
      value: 2.1,
      is: 2.4e-18,
      n: 2,
      rOn: 10,
      cj: 1e-12,
    },
  },
  {
    id: "led-blue",
    name: "LED (blue)",
    category: "peripheral",
    kind: "led",
    size: { w: 5, h: 5, t: 8 },
    color: "#3366ff",
    pins: [g("A", 0), g("K", 1)],
    firmware: ["blink"],
    electronics: {
      device: "led",
      value: 3.0,
      is: 8.5e-20,
      n: 2.2,
      rOn: 10,
      cj: 1.5e-12,
    },
  },
  {
    id: "rgb-led",
    name: "RGB LED",
    category: "peripheral",
    kind: "rgbled",
    size: { w: 5, h: 5, t: 8 },
    color: "#ffffff",
    pins: [g("R", 0), g("G", 1), g("B", 2), g("K", 3)],
    firmware: ["rgb-cycle"],
  },
  {
    id: "buzzer",
    name: "Piezo buzzer",
    category: "peripheral",
    kind: "buzzer",
    size: { w: 12, h: 12, t: 9 },
    color: "#101010",
    pins: [g("+", 0), g("-", 1)],
    firmware: ["buzzer-melody"],
  },
  {
    id: "servo-sg90",
    name: "Servo SG90",
    category: "peripheral",
    kind: "servo",
    size: { w: 23, h: 12.2, t: 22.5 },
    color: "#2266cc",
    pins: [g("SIG", 0), pwr("VCC", "vcc"), pwr("GND")],
    firmware: ["servo-sweep"],
  },
  {
    id: "button",
    name: "Push button",
    category: "peripheral",
    kind: "button",
    size: { w: 6, h: 6, t: 4.3 },
    color: "#cc2222",
    pins: [g("1", 0), g("2", 1)],
    firmware: ["button-led"],
  },
  {
    id: "pot",
    name: "Potentiometer",
    category: "peripheral",
    kind: "pot",
    size: { w: 10, h: 10, t: 6 },
    color: "#888888",
    pins: [pwr("VCC", "vcc"), g("SIG", 0), pwr("GND")],
    firmware: ["pot-dimmer"],
  },
  {
    id: "rf-tx-433",
    name: "RF transmitter 433 MHz (OOK)",
    category: "peripheral",
    kind: "rf-tx",
    size: { w: 20, h: 15, t: 4 },
    color: "#1d5c8a",
    pins: [g("DATA", 0), pwr("VCC", "vcc"), pwr("GND")],
    firmware: ["rf-send"],
    radio: { role: "tx", mhz: 433.92, powerDbm: 10, lossDb: 25 },
  },
  {
    id: "rf-rx-433",
    name: "RF receiver 433 MHz (OOK)",
    category: "peripheral",
    kind: "rf-rx",
    size: { w: 20, h: 15, t: 5 },
    color: "#2a6b3f",
    pins: [g("OUT", 0), pwr("VCC", "vcc"), pwr("GND")],
    firmware: ["rf-receive"],
    radio: { role: "rx", mhz: 433.92, sensitivityDbm: -95, lossDb: 25 },
  },
  {
    id: "resistor-220",
    name: "Resistor 220 Ω",
    category: "peripheral",
    kind: "resistor",
    size: { w: 6.3, h: 2.3, t: 2.3 },
    color: "#d9c9a3",
    pins: [el("1"), el("2")],
    firmware: [],
    electronics: { device: "resistor", value: 220 },
  },
  {
    id: "resistor-1k",
    name: "Resistor 1 kΩ",
    category: "peripheral",
    kind: "resistor",
    size: { w: 6.3, h: 2.3, t: 2.3 },
    color: "#d9c9a3",
    pins: [el("1"), el("2")],
    firmware: [],
    electronics: { device: "resistor", value: 1000 },
  },
  {
    id: "resistor-10k",
    name: "Resistor 10 kΩ",
    category: "peripheral",
    kind: "resistor",
    size: { w: 6.3, h: 2.3, t: 2.3 },
    color: "#d9c9a3",
    pins: [el("1"), el("2")],
    firmware: [],
    electronics: { device: "resistor", value: 10_000 },
  },
  {
    id: "capacitor-100u",
    name: "Capacitor 100 µF",
    category: "peripheral",
    kind: "capacitor",
    size: { w: 8, h: 8, t: 11 },
    color: "#223344",
    pins: [el("+"), el("-")],
    firmware: [],
    electronics: { device: "capacitor", value: 100e-6 },
  },
  {
    id: "coil-100mh",
    name: "Coil 100 mH",
    category: "peripheral",
    kind: "inductor",
    size: { w: 12, h: 12, t: 9 },
    color: "#8a5a2b",
    pins: [el("1"), el("2")],
    firmware: [],
    electronics: { device: "inductor", value: 0.1 },
  },
  {
    id: "diode-1n4148",
    name: "Diode 1N4148",
    category: "peripheral",
    kind: "diode",
    size: { w: 4.5, h: 2, t: 2 },
    color: "#1b1b1b",
    pins: [el("A"), el("K")],
    firmware: [],
    electronics: {
      device: "diode",
      value: 0.7,
      is: 2.52e-9,
      n: 1.752,
      rOn: 0.5,
      vbr: 100,
      cj: 4e-12,
    },
  },
  {
    id: "transistor-2n3904",
    name: "NPN transistor 2N3904",
    category: "peripheral",
    kind: "transistor",
    size: { w: 5, h: 4.5, t: 4.5 },
    color: "#101010",
    pins: [el("B"), el("C"), el("E")],
    firmware: [],
    electronics: {
      device: "npn",
      value: 0.75,
      is: 6.7e-15,
      n: 1,
      bf: 200,
      br: 4,
      vaf: 75,
      cj: 4e-12,
    },
  },
  {
    id: "mosfet-2n7000",
    name: "N-MOSFET 2N7000",
    category: "peripheral",
    kind: "mosfet",
    size: { w: 5, h: 4.5, t: 4.5 },
    color: "#101010",
    pins: [el("G"), el("D"), el("S")],
    firmware: [],
    electronics: {
      device: "mosfet",
      value: 2.1,
      k: 0.15,
      lambda: 0.02,
      cj: 50e-12,
    },
  },
  {
    id: "battery-5v",
    name: "Battery pack 5 V",
    category: "peripheral",
    kind: "battery",
    size: { w: 26, h: 14, t: 12 },
    color: "#333333",
    pins: [el("+"), el("-")],
    firmware: [],
    electronics: { device: "battery", value: 5 },
  },
  {
    id: "battery-9v",
    name: "Battery 9 V",
    category: "peripheral",
    kind: "battery",
    size: { w: 26, h: 17, t: 16 },
    color: "#2c2c2c",
    pins: [el("+"), el("-")],
    firmware: [],
    electronics: { device: "battery", value: 9 },
  },
  {
    id: "capacitor-100n",
    name: "Capacitor 100 nF",
    category: "peripheral",
    kind: "capacitor",
    size: { w: 5, h: 5, t: 7 },
    color: "#20405a",
    pins: [el("+"), el("-")],
    firmware: [],
    electronics: { device: "capacitor", value: 100e-9 },
  },
  {
    id: "zener-5v1",
    name: "Zener diode 5.1 V",
    category: "peripheral",
    kind: "diode",
    size: { w: 4.5, h: 2, t: 2 },
    color: "#202020",
    pins: [el("A"), el("K")],
    firmware: [],
    electronics: {
      device: "diode",
      value: 0.7,
      is: 1e-11,
      n: 1.75,
      rOn: 0.5,
      vbr: 5.1,
      isZ: 1e-9,
      nz: 0.2,
      cj: 4e-12,
    },
  },
];

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

const ALL: EcadPart[] = [...boards, ...displays, ...peripherals];

const byId = new Map<string, EcadPart>(ALL.map((part) => [part.id, part]));

export function getPart(id: string): EcadPart | undefined {
  return byId.get(id);
}

export function allParts(): EcadPart[] {
  return [...ALL];
}

export function boardsAll(): BoardPart[] {
  return boards;
}

export function displaysAll(): DisplayPart[] {
  return displays;
}

export function peripheralsAll(): PeripheralPart[] {
  return peripherals;
}

export function findPartByName(q: string): EcadPart[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return ALL.filter(
    (part) =>
      part.name.toLowerCase().includes(needle) ||
      part.id.toLowerCase().includes(needle) ||
      ("mcu" in part && part.mcu.toLowerCase().includes(needle)),
  );
}

/** The pin set of any part, flattened (used for wiring validation). */
export function pinsOf(part: EcadPart): PartPin[] {
  if (part.category === "board") return part.headers.flatMap((h) => h.pins);
  return part.pins;
}

/** Is `id` a valid pin name on `part`? */
export function hasPin(partId: string, pin: string): boolean {
  const part = byId.get(partId);
  return !!part && pinsOf(part).some((p2) => p2.name === pin);
}
