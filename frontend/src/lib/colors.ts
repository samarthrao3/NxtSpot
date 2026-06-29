const PALETTE = ['#1E6B7B', '#B83A26', '#E2A83A', '#3A7D44', '#7B3FA0', '#2E5FA3', '#C4622D', '#A63256']

export function colorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}
