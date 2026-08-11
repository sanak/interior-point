declare module "jsts/org/locationtech/jts/io/GeoJSONReader.js" {
  export default class GeoJSONReader {
    constructor();
    read(geoJson: unknown): { getInteriorPoint(): { getX(): number; getY(): number } };
  }
}
