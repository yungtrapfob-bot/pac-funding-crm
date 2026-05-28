import { promises as fs } from 'node:fs';
import path from 'node:path';

export type NormalizedFunderRow = {
  funderName: string;
  positions: string;
  states: string;
  minMonthlyRevenue: number | null;
  minTimeInBusinessMonths: number | null;
  minFico: number | null;
  maxFunding: number | null;
  paymentFrequency: string;
  requiredDocs: string;
  industryYes: string;
  industryMaybe: string;
  industryNo: string;
  notes: string;
  matrixRow: Record<string, string>;
};

export type RoutingInputRow = { inputName: string; exampleValue: string; ruleNotes: string; sortOrder: number };
export type LegendRuleRow = { legendKey: string; meaning: string };

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(content: string): string[][] {
  return content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map(parseCsvLine);
}

function toNumber(value: string): number | null {
  const match = value.replace(/[$,%+]/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export async function loadNormalizedFunderImport() {
  const root = process.cwd();
  const [matrixRaw, routerRaw, legendRaw] = await Promise.all([
    fs.readFile(path.join(root, 'matrix.csv'), 'utf8'),
    fs.readFile(path.join(root, 'deal_router.csv'), 'utf8'),
    fs.readFile(path.join(root, 'legend.csv'), 'utf8')
  ]);

  const matrixRows = parseCsv(matrixRaw);
  const sectionRow = matrixRows[0] ?? [];
  const headerRowIndex = 1;
  const headers = (matrixRows[headerRowIndex] ?? []).map((value, index) => {
    if (value && !/^unnamed:?/i.test(value)) return value;
    const fromBand = sectionRow[index] || sectionRow[index - 1] || `Column ${index + 1}`;
    return `${fromBand} ${index + 1}`.trim();
  });

  const funders: NormalizedFunderRow[] = matrixRows
    .slice(headerRowIndex + 1)
    .map((row) => {
      const matrixRow = Object.fromEntries(headers.map((header, i) => [header, (row[i] || '').trim()]));
      const funderName = matrixRow['Funder'] || '';
      return {
        funderName,
        positions: matrixRow['Positions'] || '',
        states: matrixRow['States'] || '',
        minMonthlyRevenue: toNumber(matrixRow['Min Monthly Rev'] || ''),
        minTimeInBusinessMonths: toNumber(matrixRow['Min Time in Biz (Months)'] || ''),
        minFico: toNumber(matrixRow['Min FICO'] || ''),
        maxFunding: toNumber(matrixRow['Max Funding'] || ''),
        paymentFrequency: matrixRow['Payment Frequency'] || '',
        requiredDocs: matrixRow['Required Docs'] || '',
        industryYes: matrixRow['Preferred Industries (YES)'] || '',
        industryMaybe: matrixRow['Conditional Industries (MAYBE / Rules)'] || '',
        industryNo: matrixRow['Restricted / Prohibited Industries (NO)'] || '',
        notes: matrixRow['Notes'] || '',
        matrixRow
      };
    })
    .filter((row) => row.funderName.length > 0);

  const routerRows = parseCsv(routerRaw);
  const routingInputs: RoutingInputRow[] = routerRows
    .slice(3)
    .map((row, index) => ({
      inputName: (row[0] || '').trim(),
      exampleValue: (row[1] || '').trim(),
      ruleNotes: (row[2] || '').trim(),
      sortOrder: index + 1
    }))
    .filter((row) => row.inputName.length > 0);

  const legendRows = parseCsv(legendRaw);
  const legendRules: LegendRuleRow[] = legendRows
    .slice(1)
    .map((row) => ({ legendKey: (row[0] || '').trim(), meaning: (row[1] || '').trim() }))
    .filter((row) => row.legendKey.length > 0);

  return {
    matrixHeaderRowIndex: headerRowIndex,
    matrixHeaders: headers,
    funders,
    routingInputs,
    legendRules
  };
}
