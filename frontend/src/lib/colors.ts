const PALETTE = ['#99420d', '#556b2f', '#000080', '#6b4226', '#2f4858', '#7a3000']

export function colorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}
