import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SmartsheetColumn {
  id: number;
  title: string;
  type: string;
}

interface SmartsheetCell {
  columnId: number;
  value?: string | number | boolean;
  displayValue?: string;
}

interface SmartsheetRow {
  id: number;
  rowNumber: number;
  cells: SmartsheetCell[];
}

interface SmartsheetSheet {
  id: number;
  name: string;
  columns: SmartsheetColumn[];
  rows: SmartsheetRow[];
}

export interface SmartsheetRecord {
  rowId: number;
  rowNumber: number;
  [columnTitle: string]: string | number | boolean | null | undefined;
}

@Injectable()
export class SmartsheetService {
  private readonly logger = new Logger(SmartsheetService.name);
  private readonly baseUrl = 'https://api.smartsheet.com/2.0';

  constructor(private readonly config: ConfigService) {}

  private get token(): string {
    return this.config.get<string>('SMARTSHEET_API_TOKEN', '');
  }

  private get sheetId(): string {
    return this.config.get<string>('SMARTSHEET_SHEET_ID', '');
  }

  async fetchSheet(): Promise<SmartsheetSheet> {
    const url = `${this.baseUrl}/sheets/${this.sheetId}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      this.logger.error('Smartsheet API network error', err);
      throw new InternalServerErrorException('Failed to reach Smartsheet API');
    }

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Smartsheet API error ${res.status}: ${body}`);
      throw new InternalServerErrorException(`Smartsheet API returned ${res.status}`);
    }

    return res.json() as Promise<SmartsheetSheet>;
  }

  async getFilteredData(from: string, to: string): Promise<{
    sheetName: string;
    dateColumn: string | null;
    from: string;
    to: string;
    totalRows: number;
    filteredRows: number;
    records: SmartsheetRecord[];
  }> {
    const sheet = await this.fetchSheet();

    const columnMap = new Map<number, SmartsheetColumn>();
    for (const col of sheet.columns) {
      columnMap.set(col.id, col);
    }

    // Find columns of type DATE or with "date" in the title (case-insensitive)
    const dateColumns = sheet.columns.filter(
      (c) => c.type === 'DATE' || c.title.toLowerCase().includes('date'),
    );

    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const allRecords: SmartsheetRecord[] = sheet.rows.map((row) => {
      const record: SmartsheetRecord = { rowId: row.id, rowNumber: row.rowNumber };
      for (const cell of row.cells) {
        const col = columnMap.get(cell.columnId);
        if (col) {
          record[col.title] = cell.displayValue ?? cell.value ?? null;
        }
      }
      return record;
    });

    // If date columns found, filter by them; otherwise return all rows
    let filteredRecords = allRecords;
    if (dateColumns.length > 0) {
      filteredRecords = allRecords.filter((record) => {
        return dateColumns.some((col) => {
          const rawVal = record[col.title];
          if (!rawVal) return false;
          const d = new Date(String(rawVal));
          return !isNaN(d.getTime()) && d >= fromDate && d <= toDate;
        });
      });
    }

    return {
      sheetName: sheet.name,
      dateColumn: dateColumns.length > 0 ? dateColumns[0].title : null,
      from,
      to,
      totalRows: sheet.rows.length,
      filteredRows: filteredRecords.length,
      records: filteredRecords,
    };
  }
}
