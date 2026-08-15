import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attributePopupHtml, pointPopupHtml } from "../src/ui/popup.ts";

describe("attributePopupHtml", () => {
  it("renders one row per attribute", () => {
    const html = attributePopupHtml({ building_id: "34100-bldg-370791", measured_height: 35.3 });
    assert.match(html, /<th>building_id<\/th><td>34100-bldg-370791<\/td>/);
    assert.match(html, /<th>measured_height<\/th><td>35.3<\/td>/);
  });

  it("omits null, undefined and empty values so the table stays readable", () => {
    const html = attributePopupHtml({ name: null, address: undefined, description: "", city_code: "34101" });
    assert.doesNotMatch(html, /name|address|description/);
    assert.match(html, /<th>city_code<\/th><td>34101<\/td>/);
  });

  it("reports when a feature carries nothing worth showing", () => {
    assert.match(attributePopupHtml({ name: null }), /No attributes/);
    assert.match(attributePopupHtml(null), /No attributes/);
  });

  it("escapes markup so a dropped file cannot inject HTML", () => {
    const html = attributePopupHtml({ "<img>": '"x" & <b>y</b>' });
    assert.doesNotMatch(html, /<img>|<b>/);
    assert.match(html, /&lt;img&gt;/);
    assert.match(html, /&quot;x&quot; &amp; &lt;b&gt;y&lt;\/b&gt;/);
  });
});

describe("pointPopupHtml", () => {
  it("gives each ordinate its own labelled row, at full precision", () => {
    const html = pointPopupHtml("interior-point (TS)", [132.4567890123456, 34.3891234567891]);
    assert.match(html, /interior-point \(TS\)/);
    assert.match(html, /<th>Longitude<\/th><td><code>132\.4567890123456<\/code><\/td>/);
    assert.match(html, /<th>Latitude<\/th><td><code>34\.3891234567891<\/code><\/td>/);
    assert.doesNotMatch(html, /132\.4567890123456, 34\.3891234567891/);
  });

  it("labels a third ordinate as the elevation", () => {
    assert.match(pointPopupHtml("x", [1, 2, 3]), /<th>Elevation<\/th><td><code>3<\/code><\/td>/);
  });

  it("shows the input feature's attributes above the coordinates", () => {
    const html = pointPopupHtml("x", [1, 2], { building_id: "34100-bldg-370791" });
    assert.match(html, /<th>building_id<\/th><td>34100-bldg-370791<\/td>/);
    assert.ok(html.indexOf("34100-bldg-370791") < html.indexOf("Longitude"), "attributes must come first");
  });

  it("omits the attribute table when the feature carries nothing worth showing", () => {
    for (const properties of [undefined, null, {}, { name: null }]) {
      const html = pointPopupHtml("x", [1, 2], properties);
      assert.doesNotMatch(html, /popup-attributes|No attributes/);
      assert.match(html, /<th>Longitude<\/th>/);
    }
  });

  it("escapes the label and the attributes", () => {
    const html = pointPopupHtml("<b>x</b>", [1, 2], { "<img>": "<em>y</em>" });
    assert.doesNotMatch(html, /<b>|<img>|<em>/);
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.match(html, /&lt;img&gt;/);
  });
});
