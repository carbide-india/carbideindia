/** Cylinder weight in grams. Volume = 0.785 * OD^2 * L (mm); weight = volume * density (g/mm^3). */
export function cylinderWeightGms(odMm: number, lengthMm: number, densityGPerMm3: number): number {
  return 0.785 * odMm * odMm * lengthMm * densityGPerMm3;
}
/** Hollow cylinder: (OD^2 - ID^2). */
export function hollowCylinderWeightGms(odMm: number, idMm: number, lengthMm: number, densityGPerMm3: number): number {
  return 0.785 * (odMm * odMm - idMm * idMm) * lengthMm * densityGPerMm3;
}
/** Cuboid (flat): L * W * H. */
export function cuboidWeightGms(lMm: number, wMm: number, hMm: number, densityGPerMm3: number): number {
  return lMm * wMm * hMm * densityGPerMm3;
}
