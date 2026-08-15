import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attributePopupHtml } from "../src/ui/popup.ts";

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
