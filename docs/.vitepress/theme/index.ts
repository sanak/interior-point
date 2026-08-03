import { h } from "vue";
import DefaultTheme from "vitepress/theme";

import MapDemo from "./MapDemo.vue";

/**
 * `VPHome.vue` renders hero → `home-hero-after` → `home-features-before` → features → `<Content />`,
 * so Markdown body content can only appear after the features. The map belongs between the hero and
 * the features, which leaves the slot as the only place to put it. The slot exists on the home layout
 * alone, so no other page is affected.
 */
export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "home-hero-after": () => h(MapDemo),
    });
  },
};
