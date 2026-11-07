esp32sim — MIT (c) the esp32sim authors
Source: https://github.com/mikroverk/esp32sim at 3d276edfd9bc31b4622c13015f04f61114e35315
Built from source with rustc 1.99.1 (wasm32-unknown-unknown) via tools/wasm-build.sh,
with the host ABI additions the ScadGen tier uses: `esp32sim_gpio_enable/take/
cycle/pin/level/set` (GPIO edge capture and pad input), `esp32sim_ble_enable`
(VHCI Bluetooth from the application ELF's symbols) and `esp32sim_load_at`
(combined images written at 0x1000).
WASM sha256: 1170e9426ba8cc59a4268ff1780c66058c103b587444599ce41e1375bf93f632

Mask ROM: esp32_rev300_rom.elf from espressif/esp-rom-elfs release 20260528,
Apache-2.0 (see ROM-NOTICE.txt and APACHE-2.0.txt).
ROM sha256: 920b70635440517866aab2230964a570d2cf2b676658d93c52fbac108c1cca31

classic-hello-*: ESP-IDF 5.5.4 hello_world for esp32dev (example CC0-1.0),
linked firmware licences in classic-hello-NOTICE.txt.

micropython-esp32.bin: stock MicroPython v1.29.0 (ESP32_GENERIC, micropython.org,
MIT; the image also links ESP-IDF v5.5.2 and Espressif's Wi-Fi/PHY libraries —
see micropython-esp32-NOTICE.txt). It is a combined image written at 0x1000,
not a merged image at 0x0, and doubles as the pin fixture in
src/ecad/__tests__/esp32.test.ts.
sha256: e67ad6015a0a504c1fec9aa9bbf589d0432ed28e62546f4f8dd8a147f8bd95f6
