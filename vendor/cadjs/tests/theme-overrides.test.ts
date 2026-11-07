import { BODY, LIGHTING, THEME_DEFAULTS } from "../src/theme";
import { configureCadjs, getCadjsConfig } from "../src/config";

describe("theme overrides", () => {
  const originalBody = BODY;
  const originalKeyLight = LIGHTING.keyLight;
  const originalBodyDefault = BODY.default;
  const originalBodySelected = BODY.selected;
  const originalKeyLightColor = LIGHTING.keyLight.color;
  const originalKeyLightIntensity = LIGHTING.keyLight.intensity;

  afterEach(() => {
    // Restore so subsequent tests in the suite (and other test files) see
    // the original theme. We mutate the same live objects to roll back.
    configureCadjs({
      theme: {
        BODY: { default: originalBodyDefault, selected: originalBodySelected },
        LIGHTING: {
          keyLight: {
            color: originalKeyLightColor,
            intensity: originalKeyLightIntensity,
          },
        },
      },
    });
  });

  it("partial-deep-merges into live theme objects", () => {
    configureCadjs({
      theme: {
        BODY: { default: 0x00ff00 },
        LIGHTING: { keyLight: { color: 0xff0000 } },
      },
    });

    expect(BODY.default).toBe(0x00ff00);
    expect(BODY.selected).toBe(originalBodySelected);
    expect(LIGHTING.keyLight.color).toBe(0xff0000);
    expect(LIGHTING.keyLight.intensity).toBe(originalKeyLightIntensity);
  });

  it("preserves the identity of every theme export", () => {
    configureCadjs({ theme: { BODY: { default: 0x123456 } } });

    expect(BODY).toBe(originalBody);
    expect(LIGHTING.keyLight).toBe(originalKeyLight);
  });

  it("keeps THEME_DEFAULTS frozen at original values", () => {
    configureCadjs({ theme: { BODY: { default: 0xabcdef } } });

    expect(THEME_DEFAULTS.BODY.default).toBe(originalBodyDefault);
    expect(Object.isFrozen(THEME_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(THEME_DEFAULTS.BODY)).toBe(true);
  });

  it("does not carry theme inside the runtime config snapshot", () => {
    configureCadjs({ theme: { BODY: { default: 0x222222 } } });

    expect(getCadjsConfig().theme).toBeUndefined();
  });

  it("ignores undefined theme without disturbing existing config", () => {
    configureCadjs({ debug: true });
    expect(getCadjsConfig().debug).toBe(true);
    expect(BODY.default).toBe(originalBodyDefault);

    configureCadjs({ debug: false });
  });
});
