// ecad/firmware.ts — the firmware registry: what ships preloaded per board,
// and the source of truth for "upload all their firmware".
//
// Three tiers:
// - virtual: Arduino-flavored ScadGen JS (runs on EVERY board via runtime.ts)
// - hex: real compiled binaries for AVR boards (assembled + emulator-proven
//   in __tests__/hex.test.ts — see hex.ts for the assembler and avrChips.ts
//   for the per-chip register maps the emulator runs them against)
// - binary: validated images for MCUs with no in-app emulator (delivery only;
//   RP2040 / STM32F4 / classic ESP32 uploads run and get those tiers)

import {
  ATTINY85_BLINK_HEX,
  LEONARDO_BLINK_HEX,
  MEGA_BLINK_HEX,
  NANO_BLINK_HEX,
  UNO_BLINK_HEX,
} from "./hex";

export type FirmwareTier =
  | "virtual"
  | "hex"
  | "binary"
  | "rp2040"
  | "stm32f4"
  | "esp32";

export interface FirmwareEntry {
  id: string;
  title: string;
  /** Boards this firmware targets (catalog ids). Empty = any board. */
  boards: string[];
  tier: FirmwareTier;
  language: "scadgen-js" | "avr-hex" | "binary";
  /** The firmware body: JS source, or Intel HEX text. */
  source: string;
  desc?: string | undefined;
}

// ---------------------------------------------------------------------------
// Virtual-firmware sketch library (ScadGen JS)
// ---------------------------------------------------------------------------

const SKETCHES: Record<string, string> = {
  blink: `
// Blink — the hello world of firmware. Toggles the onboard LED (or any wired
// LED) every 500 ms.
const LED = LED_PIN;
function setup() {
  pinMode(LED, OUTPUT);
}
async function loop() {
  digitalWrite(LED, HIGH);
  await delay(500);
  digitalWrite(LED, LOW);
  await delay(500);
}
`,
  "hello-serial": `
// Serial hello — prints a counter over USB serial once a second.
function setup() {
  Serial.begin(9600);
}
let n = 0;
async function loop() {
  Serial.println("scadgen alive: " + n++);
  await delay(1000);
}
`,
  "button-led": `
// Button + LED — reads INPUT_PULLUP wiring; LED mirrors the button.
const LED = LED_PIN;
const BTN = BTN_PIN;
function setup() {
  pinMode(LED, OUTPUT);
  pinMode(BTN, INPUT_PULLUP);
}
async function loop() {
  digitalWrite(LED, digitalRead(BTN) ? LOW : HIGH);
  await delay(20);
}
`,
  "hello-oled": `
// Hello OLED — draws text + a running pixel on an I2C OLED wired to the
// board (any ssd1306/sh1106 in the scene).
function setup() {}
let x = 0;
async function loop() {
  Display.clear();
  Display.text("SCADGEN MCU", 0, 0);
  Display.text("alive " + (x % 100), 0, 12);
  Display.pixel(x % Display.size[0], 32 + (x % 16), 1);
  await delay(120);
  x++;
}
`,
  "hello-tft": `
// Color TFT rainbow sweep (ST7735 / ILI9341 wired over SPI).
function setup() {}
let t = 0;
async function loop() {
  Display.fill((t * 4) & 0xffffff);
  Display.text("SCADGEN", 10, 10, 0xffffff);
  Display.rect(20, 40, 60, 30, false, 0x00ff00);
  await delay(60);
  t++;
}
`,
  "hello-lcd": `
// 16x2 character LCD over I2C backpack.
function setup() {}
let n = 0;
async function loop() {
  Display.clear();
  Display.text("scadgen firmware", 0, 0);
  Display.text("ticks: " + n++, 0, 1);
  await delay(500);
}
`,
  "hello-matrix": `
// MAX7219 8x8 matrix heartbeat.
function setup() {}
let beat = 0;
async function loop() {
  Display.clear();
  const c = beat % 2 ? 4 : 3;
  for (let i = c - 1; i <= c + 1; i++)
    for (let j = c - 1; j <= c + 1; j++) Display.pixel(i, j, 1);
  await delay(beat % 2 ? 400 : 150);
  beat++;
}
`,
  "hello-7seg": `
// TM1637 4-digit counter.
function setup() {}
let n = 0;
async function loop() {
  Display.text(String(n).padStart(4, "0"));
  await delay(250);
  n++;
}
`,
  "hello-epaper": `
// E-paper hello (updates are slow on real e-ink; simulated at sim speed).
function setup() {}
async function loop() {
  Display.clear();
  Display.text("EPAPER", 4, 4);
  Display.rect(2, 14, 60, 10, false);
  await delay(1000);
}
`,
  "servo-sweep": `
// Servo sweep — needs a servo wired to SERVO_PIN.
const S = SERVO_PIN;
function setup() {
  Servo.attach(S);
}
async function loop() {
  for (let a = 0; a <= 180; a += 2) {
    Servo.write(a);
    await delay(15);
  }
  for (let a = 180; a >= 0; a -= 2) {
    Servo.write(a);
    await delay(15);
  }
}
`,
  "rgb-cycle": `
// RGB LED color cycle — R/G/B wired to three PWM-capable pins.
const R = R_PIN, G = G_PIN, B = B_PIN;
function setup() {}
async function loop() {
  for (let i = 0; i < 256; i += 8) {
    analogWrite(R, i); analogWrite(G, 255 - i); analogWrite(B, 128);
    await delay(10);
  }
}
`,
  "buzzer-melody": `
// Piezo melody — buzzer on BUZZ_PIN.
const BUZZ = BUZZ_PIN;
const NOTES = [262, 294, 330, 349, 392, 440, 494, 523];
function setup() {}
async function loop() {
  for (const f of NOTES) {
    tone(BUZZ, f);
    await delay(180);
    noTone(BUZZ);
    await delay(40);
  }
}
`,
  "rf-send": `
// RF link — keys an OOK transmitter wired to TX_PIN at 5 Hz. The receiver on
// the same channel reproduces these edges on RX_PIN.
function setup() {
  pinMode(TX_PIN, OUTPUT);
}
async function loop() {
  digitalWrite(TX_PIN, HIGH);
  await delay(100);
  digitalWrite(TX_PIN, LOW);
  await delay(100);
}
`,
  "rf-receive": `
// RF link — mirrors an OOK receiver's OUT pin (RX_PIN) onto LED_PIN.
function setup() {
  pinMode(RX_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
}
async function loop() {
  digitalWrite(LED_PIN, digitalRead(RX_PIN) ? HIGH : LOW);
  await delay(20);
}
`,
  "pot-dimmer": `
// Potentiometer dims the wired LED via PWM.
const LED = LED_PIN, POT = POT_PIN;
function setup() {
  pinMode(LED, OUTPUT);
}
async function loop() {
  const v = analogRead(POT);
  analogWrite(LED, Math.round(v / 4));
  await delay(30);
}
`,
  "wifi-scan": `
// WiFi scan (ESP32 / ESP8266 / Pico W). In the virtual tier the network is
// simulated: Net.scan() returns the scene's declared SSIDs.
function setup() {
  Serial.begin(115200);
}
async function loop() {
  const nets = await Net.scan();
  Serial.println("networks: " + nets.length);
  for (const n of nets) Serial.println("  " + n.ssid + " " + n.rssi + "dBm");
  await delay(3000);
}
`,
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

function entry(
  id: string,
  title: string,
  boards: string[],
  desc?: string,
): FirmwareEntry {
  return {
    id,
    title,
    boards,
    tier: "virtual",
    language: "scadgen-js",
    source: SKETCHES[id] ?? "",
    desc,
  };
}

const VIRTUAL_FIRMWARE: FirmwareEntry[] = [
  entry("blink", "Blink (onboard LED)", [], "Toggles D13/GP25 every 500 ms"),
  entry("hello-serial", "Serial hello", []),
  entry("button-led", "Button + LED", [], "LED_PIN + BTN_PIN must be wired"),
  entry("hello-oled", "Hello OLED", [], "I2C OLED wired to the board"),
  entry("hello-tft", "Color TFT sweep", [], "SPI TFT wired to the board"),
  entry("hello-lcd", "16x2 LCD hello", [], "I2C LCD wired to the board"),
  entry(
    "hello-matrix",
    "8x8 matrix heartbeat",
    [],
    "MAX7219 wired to the board",
  ),
  entry("hello-7seg", "4-digit counter", [], "TM1637 wired to the board"),
  entry("hello-epaper", "E-paper hello", [], "E-paper wired over SPI"),
  entry("servo-sweep", "Servo sweep", [], "Servo on SERVO_PIN"),
  entry("rgb-cycle", "RGB cycle", [], "R_PIN/G_PIN/B_PIN on PWM pins"),
  entry("buzzer-melody", "Buzzer melody", [], "Buzzer on BUZZ_PIN"),
  entry("pot-dimmer", "Pot dimmer", [], "POT_PIN analog + LED_PIN PWM"),
  entry("rf-send", "RF send (OOK)", [], "Transmitter DATA on TX_PIN, 5 Hz"),
  entry(
    "rf-receive",
    "RF receive (OOK)",
    [],
    "Receiver OUT on RX_PIN mirrors to LED_PIN",
  ),
  entry("wifi-scan", "WiFi scan", [
    "esp32-devkit",
    "esp32-s3",
    "esp8266-nodemcu",
    "rpi-pico-w",
  ]),
];

const HEX_FIRMWARE: FirmwareEntry[] = [
  {
    id: "blink-hex-uno",
    title: "Blink (compiled .hex, ATmega328P)",
    boards: ["arduino-uno"],
    tier: "hex",
    language: "avr-hex",
    source: UNO_BLINK_HEX,
    desc: "Assembler-built AVR binary; emulator-proven in tests. ~524 ms period on D13.",
  },
  {
    id: "blink-hex-nano",
    title: "Blink (compiled .hex, ATmega328P)",
    boards: ["arduino-nano"],
    tier: "hex",
    language: "avr-hex",
    source: NANO_BLINK_HEX,
    desc: "Same ATmega328P binary as the Uno build.",
  },
  {
    id: "blink-hex-mega",
    title: "Blink (compiled .hex, ATmega2560)",
    boards: ["arduino-mega"],
    tier: "hex",
    language: "avr-hex",
    source: MEGA_BLINK_HEX,
    desc: "Runs on the 2560 emulator (256 KB flash, 22-bit PC); D13 is PB7 on a Mega.",
  },
  {
    id: "blink-hex-leonardo",
    title: "Blink (compiled .hex, ATmega32U4)",
    boards: ["arduino-leonardo"],
    tier: "hex",
    language: "avr-hex",
    source: LEONARDO_BLINK_HEX,
    desc: "Runs on the 32U4 emulator; Leonardo D13 is PC7.",
  },
  {
    id: "blink-hex-attiny85",
    title: "Blink (compiled .hex, ATtiny85)",
    boards: ["attiny85"],
    tier: "hex",
    language: "avr-hex",
    source: ATTINY85_BLINK_HEX,
    desc: "Runs on the ATtiny85 emulator at 8 MHz; PB1 is DIP pin 6.",
  },
];

export const ALL_FIRMWARE: FirmwareEntry[] = [
  ...VIRTUAL_FIRMWARE,
  ...HEX_FIRMWARE,
];

/** Firmware preloaded for a board id (its catalog list + universal sketches). */
export function firmwareFor(boardId: string): FirmwareEntry[] {
  return ALL_FIRMWARE.filter(
    (f) => f.boards.length === 0 || f.boards.includes(boardId),
  );
}

export function getFirmware(id: string): FirmwareEntry | undefined {
  return ALL_FIRMWARE.find((f) => f.id === id);
}

/** Convenience: the canonical sketch constants each board's templates rely on. */
export function pinConstantsFor(boardId: string): Record<string, string> {
  switch (boardId) {
    case "rpi-pico":
    case "rpi-pico-w":
      return { LED_PIN: "GP25", BTN_PIN: "GP14", SERVO_PIN: "GP15" };
    case "esp32-devkit":
    case "esp32-s3":
      return { LED_PIN: "2", BTN_PIN: "4", SERVO_PIN: "13" };
    case "esp8266-nodemcu":
      return { LED_PIN: "D4", BTN_PIN: "D3", SERVO_PIN: "D1" };
    case "microbit-v2":
      return { LED_PIN: "P0", BTN_PIN: "P5", SERVO_PIN: "P1" };
    case "stm32-bluepill":
    case "stm32f4-blackpill":
      return { LED_PIN: "PC13", BTN_PIN: "PA0", SERVO_PIN: "PA1" };
    case "teensy-40":
      return { LED_PIN: "13", BTN_PIN: "1", SERVO_PIN: "14" };
    case "attiny85":
      return { LED_PIN: "PB1", BTN_PIN: "PB0", SERVO_PIN: "PB4" };
    default: // AVR/Arduino + Due
      return {
        LED_PIN: "13",
        BTN_PIN: "2",
        SERVO_PIN: "9",
        R_PIN: "9",
        G_PIN: "10",
        B_PIN: "11",
        BUZZ_PIN: "8",
        POT_PIN: "A0",
      };
  }
}
