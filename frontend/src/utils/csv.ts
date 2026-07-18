/**
 * Zero-dependency native CSV parser utilizing a Finite State Machine (FSM)
 * to safely handle double-quoted column values containing delimiters (commas),
 * escaped double quotes (""), and clean column structures.
 * 
 * @param text Raw CSV file text content
 * @returns Array of key-value objects representing row columns
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines: string[][] = [];
  let row: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  // Normalize all newline formats (\r\n and \r -> \n)
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      // Handle escaped double quote "" inside quotes
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // Skip the next double quote
      } else {
        // Toggle quote scope
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Delimiter found outside quotes: commit cell
      row.push(currentVal.trim());
      currentVal = '';
    } else if (char === '\n' && !inQuotes) {
      // Newline found outside quotes: commit cell and end row
      row.push(currentVal.trim());
      lines.push(row);
      row = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }

  // Push remainder if exists
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    lines.push(row);
  }

  if (lines.length <= 1) return [];

  // Extract and clean headers, clearing BOM values
  const headers = lines[0].map(h => h.replace(/^\uFEFF/, '').replace(/^["']|["']$/g, '').trim());
  const dataRows = lines.slice(1);

  return dataRows
    .filter(r => r.length > 0 && r.some(cell => cell.trim() !== '')) // Remove blank lines
    .map(r => {
      const obj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        if (header) {
          obj[header] = r[idx] ?? '';
        }
      });
      return obj;
    });
}
