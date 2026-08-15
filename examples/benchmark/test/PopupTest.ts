import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attributePopupHtml, pointPopupHtml } from "../src/ui/popup.ts";
import type { PointHitGroup } from "../src/ui/hits.ts";

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

function group(
  labels: readonly { label: string; color: string }[],
  position: number[],
  properties: Readonly<Record<string, unknown>> | null = null,
): PointHitGroup {
  return { labels, position, properties };
}

describe("pointPopupHtml", () => {
  it("gives each ordinate its own labelled row, at full precision", () => {
    const html = pointPopupHtml([
      group([{ label: "interior-point (TS)", color: "#E69F00" }], [132.4567890123456, 34.3891234567891]),
    ]);
    assert.match(html, /interior-point \(TS\)/);
    assert.match(html, /<th>longitude<\/th><td><code>132\.4567890123456<\/code><\/td>/);
    assert.match(html, /<th>latitude<\/th><td><code>34\.3891234567891<\/code><\/td>/);
    assert.doesNotMatch(html, /132\.4567890123456, 34\.3891234567891/);
  });

  it("labels a third ordinate as the elevation", () => {
    assert.match(pointPopupHtml([group([{ label: "x", color: "#000000" }], [1, 2, 3])]), /elevation/);
  });

  it("names every library in a group, each with its legend colour", () => {
    const html = pointPopupHtml([
      group(
        [
          { label: "interior-point (TS)", color: "#E69F00" },
          { label: "jsts (JS port)", color: "#0072B2" },
        ],
        [1, 2],
      ),
    ]);
    assert.match(html, /interior-point \(TS\)/);
    assert.match(html, /jsts \(JS port\)/);
    assert.match(html, /#E69F00/);
    assert.match(html, /#0072B2/);
  });

  it("counts the results only when more than one group is shown", () => {
    const one = pointPopupHtml([group([{ label: "a", color: "#000000" }], [1, 2])]);
    assert.doesNotMatch(one, /results here/);
    const two = pointPopupHtml([
      group([{ label: "a", color: "#000000" }], [1, 2]),
      group([{ label: "b", color: "#000000" }], [3, 4]),
    ]);
    assert.match(two, /2 results here/);
  });

  it("renders one section per group, in the order given", () => {
    const html = pointPopupHtml([
      group([{ label: "first", color: "#000000" }], [1, 2]),
      group([{ label: "second", color: "#000000" }], [3, 4]),
    ]);
    assert.ok(html.indexOf("first") < html.indexOf("second"), "groups must keep their order");
    assert.equal(html.match(/class="popup-group"/g)?.length, 2);
  });

  it("puts a group's coordinates ahead of its attributes", () => {
    const html = pointPopupHtml([
      group([{ label: "x", color: "#000000" }], [1, 2], { building_id: "34100-bldg-370791" }),
    ]);
    assert.match(html, /<th>building_id<\/th><td>34100-bldg-370791<\/td>/);
    assert.ok(html.indexOf("longitude") < html.indexOf("34100-bldg-370791"), "coordinates must come first");
  });

  it("folds the attributes away, counting them in the summary", () => {
    const html = pointPopupHtml([
      group([{ label: "x", color: "#000000" }], [1, 2], { building_id: "34100-bldg-370791", city_code: "34101" }),
    ]);
    assert.match(html, /<summary>Attributes \(2\)<\/summary>/);
    assert.doesNotMatch(html, /<details[^>]*\sopen[\s>]/, "the disclosure must start closed");
  });

  it("omits the disclosure entirely when the feature carries nothing worth showing", () => {
    for (const properties of [null, {}, { name: null }]) {
      const html = pointPopupHtml([group([{ label: "x", color: "#000000" }], [1, 2], properties)]);
      assert.doesNotMatch(html, /<details|popup-attributes|No attributes/);
      assert.match(html, /<th>longitude<\/th>/);
    }
  });

  it("escapes the labels, the colours and the attributes", () => {
    const html = pointPopupHtml([
      group([{ label: "<b>x</b>", color: '#000" onload="alert(1)' }], [1, 2], { "<img>": "<em>y</em>" }),
    ]);
    assert.doesNotMatch(html, /<b>|<img>|<em>/);
    assert.doesNotMatch(html, /onload="alert/);
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.match(html, /&lt;img&gt;/);
  });

  it("returns nothing at all for no groups", () => {
    assert.equal(pointPopupHtml([]), "");
  });
});
