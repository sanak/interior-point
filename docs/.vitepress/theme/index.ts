import { h } from "vue";
import DefaultTheme from "vitepress/theme";

import MapDemo from "./MapDemo.vue";
import "./home.css";

/**
 * `VPHero.vue` reserves the right third of the hero for an illustration and renders it only when
 * `home-hero-image` is filled — `Layout.vue` reads that slot and passes the result down as
 * `heroImageSlotExists`. Putting the map there costs no vertical space of its own, which is what
 * lets the hero, the map and the features share one viewport. The slot exists on the home layout
 * alone, so no other page is affected.
 */
export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "home-hero-image": () => h(MapDemo),
    });
  },
};
