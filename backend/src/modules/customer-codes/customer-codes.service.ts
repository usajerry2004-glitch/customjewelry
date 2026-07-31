import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join } from 'path';
import * as XLSX from 'xlsx';
import { CustomerCode } from '../../database/entities/customer-code.entity';

// Resolves under both src/ (ts-node/local) and dist/ (tsc build/production) —
// tsc preserves the directory structure, so this relative path holds either way.
const CSV_PATH = join(__dirname, '../../database/seeds/data/rightclick-customers.csv');

@Injectable()
export class CustomerCodesService {
  constructor(
    @InjectRepository(CustomerCode) private readonly repo: Repository<CustomerCode>,
  ) {}

  findAll(): Promise<CustomerCode[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  // Re-runs the bundled RightClick CSV import in place (e.g. against an
  // environment with no shell access) — idempotent upsert keyed on `code`.
  async importFromCsv(): Promise<{ parsed: number }> {
    const workbook = XLSX.readFile(CSV_PATH, { raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

    const seen = new Set<string>();
    const entries: { code: string; name: string }[] = [];
    for (const row of rows.slice(1)) {
      const code = String(row[0] ?? '').trim();
      const name = String(row[1] ?? '').trim();
      if (!code || !name || seen.has(code)) continue;
      seen.add(code);
      entries.push({ code, name });
    }

    if (entries.length) await this.repo.upsert(entries, ['code']);
    return { parsed: entries.length };
  }
}
