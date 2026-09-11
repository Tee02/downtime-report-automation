import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export const PARK_CLOSE_RIDE_DEFINITIONS = [
  { code: "EHF", name: "Epic Hummingbird Flyers", pattern: /Epic Hummingbird Flyers/i },
  { code: "VTM", name: "Epic Voyage to Moonhaven", pattern: /Epic Voyage to Moonhaven/i },
  { code: "ACR", name: "Acorn Adventure", pattern: /Acorn Adventure/i },
  { code: "ETI", name: "Expedition Thin Ice", pattern: /Expedition Thin Ice/i },
  { code: "MFZ", name: "Mammoth Fun Zone", pattern: /Mammoth Fun Zone/i },
  { code: "SRS", name: "Sid's Rock 'N' Slide", pattern: /Sid's Rock/i },
  { code: "AFP", name: "Alpha Fighter Pilots", pattern: /Alpha Fighter Pilots/i },
  { code: "BCT (EV)", name: "Boot Camp Training - Extreme Vert", pattern: /Extreme Vert/i },
  { code: "BCT (RC)", name: "Boot Camp Training - Ropes Course", pattern: /Ropes Course/i },
  { code: "BCT (UZ)", name: "Boot Camp Training - Unharnessed Zones", pattern: /Unharnessed Zones/i },
  { code: "BCT (ZC)", name: "Trick Coaster", pattern: /Trick Coaster/i },
  { code: "TTC", name: "Terraform Tower Challenge", pattern: /Terraform Tower Challenge/i },
  { code: "BWZ", name: "Bigweld's Zeppelin", pattern: /Bigweld's Zeppelin/i },
  { code: "RTR", name: "Rivet Town Roller", pattern: /Rivet Town Roller/i },
  { code: "BSC", name: "Blue Sky Carousel", pattern: /Blue Sky Carousel/i },
  { code: "SAG", name: "Samba Gliders", pattern: /Samba Gliders/i },
  { code: "RCC", name: "Rio Carnaval Chaos", pattern: /Rio Carnaval Chaos/i },
  { code: "ESD", name: "Earth Space Defender", pattern: /Earth Space Defender/i },
  { code: "IDD", name: "Independence Day : Defiance", pattern: /Independence Day/i },
  { code: "PTA", name: "Invasion Of Planet Of The Apes", pattern: /Planet Of The Apes/i },
  { code: "NTM", name: "Night At The Museum", pattern: /Night At The Museum/i },
];

export async function parseParkCloseTimesFromPdf(pdfBuffer: Buffer): Promise<Record<string, string>> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  const rows: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
  for (const rawItem of content.items) {
    const item = rawItem as { str?: string; transform?: number[] };
    if (!item.str || !item.str.trim() || !item.transform) continue;
    const y = Math.round(item.transform[5]);
    const x = Math.round(item.transform[4]);
    let targetRow = rows.find(r => Math.abs(r.y - y) <= 3);
    if (!targetRow) {
      targetRow = { y, items: [] };
      rows.push(targetRow);
    }
    targetRow.items.push({ x, text: item.str.trim() });
  }

  // Divide into left (x < 500) and right (x >= 500) column segments
  const segments: Array<Array<{ x: number; text: string }>> = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    const leftItems = r.items.filter(i => i.x < 500);
    const rightItems = r.items.filter(i => i.x >= 500);
    if (leftItems.length > 0) segments.push(leftItems);
    if (rightItems.length > 0) segments.push(rightItems);
  }

  const results: Record<string, string> = {};
  for (const seg of segments) {
    const fullText = seg.map(i => i.text).join(" ");
    for (const ride of PARK_CLOSE_RIDE_DEFINITIONS) {
      if (ride.pattern.test(fullText)) {
        const timeMatches = fullText.match(/\b\d{4}\b/g);
        if (timeMatches && timeMatches.length > 0) {
          // 10-7 is the last reporting time column
          const closeTimeRaw = timeMatches[timeMatches.length - 1];
          if (closeTimeRaw !== "0000") {
            const hh = closeTimeRaw.slice(0, 2);
            const mm = closeTimeRaw.slice(2, 4);
            results[ride.code] = `${hh}:${mm}`;
          } else {
            results[ride.code] = "CLOSED";
          }
        }
      }
    }
  }
  return results;
}
