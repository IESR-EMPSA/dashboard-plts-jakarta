type Box = [[number, number], [number, number]]

/** A visual existence check, never a count/statistical aggregation from tiles.
 * Query small screen cells so dense views don't materialize every visible building.
 * Their union covers the exact viewport, including its edges, when no match exists.
 */
export function viewportHasFeatures(width: number, height: number, query: (box: Box) => readonly unknown[]): boolean {
  if (width <= 0 || height <= 0) return false
  const size = 128, columns = Math.ceil(width / size), rows = Math.ceil(height / size)
  const cells: { x: number; y: number; distance: number }[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    cells.push({ x, y, distance: (x - (columns - 1) / 2) ** 2 + (y - (rows - 1) / 2) ** 2 })
  }
  cells.sort((a, b) => a.distance - b.distance)
  for (const { x, y } of cells) {
    if (query([[x * size, y * size], [Math.min(width, (x + 1) * size), Math.min(height, (y + 1) * size)]]).length) return true
  }
  return false
}
