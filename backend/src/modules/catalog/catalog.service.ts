import { Injectable, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogItem, CatalogItemKind } from '../../database/entities/catalog-item.entity';

// Mirrors what used to be the hardcoded Factory/SupplySource enums — seeded
// once so existing Order/User rows referencing these keys keep resolving
// after the switch to a DB-backed catalog. "Embassy Of Jewels" is the first
// factory added under the new system, seeded here rather than added by hand
// through the UI.
const DEFAULT_FACTORIES = [
  { key: 'KAMA_JEWELRY', label: 'Kama Jewelry' },
  { key: 'CREATIONS', label: 'Creations' },
  { key: 'UNIQUE_DESIGNS', label: 'Unique Designs' },
  { key: 'JEWEL_ONE', label: 'Jewel One' },
  { key: 'EMBASSY_OF_JEWELS', label: 'Embassy Of Jewels' },
];
const DEFAULT_SUPPLY_SOURCES = [
  { key: 'STONE_CREATIONS', label: 'Creations' },
  { key: 'KIRA', label: 'Kira' },
  { key: 'KIRA_JEWELS_USA', label: 'Kira Jewels Usa' },
];

@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(
    @InjectRepository(CatalogItem) private readonly repo: Repository<CatalogItem>,
  ) {}

  // Idempotent — only inserts keys missing from the table, so this is safe to
  // run on every boot without touching anything an Admin has since added or
  // deactivated.
  async onModuleInit(): Promise<void> {
    await this.seedMissing(CatalogItemKind.FACTORY, DEFAULT_FACTORIES);
    await this.seedMissing(CatalogItemKind.SUPPLY_SOURCE, DEFAULT_SUPPLY_SOURCES);
  }

  private async seedMissing(kind: CatalogItemKind, defaults: { key: string; label: string }[]): Promise<void> {
    const existing = await this.repo.find({ where: { kind } });
    const existingKeys = new Set(existing.map(e => e.key));
    const missing = defaults.filter(d => !existingKeys.has(d.key));
    if (missing.length) {
      await this.repo.save(missing.map(d => this.repo.create({ kind, key: d.key, label: d.label })));
    }
  }

  findAll(kind: CatalogItemKind): Promise<CatalogItem[]> {
    return this.repo.find({ where: { kind, isActive: true }, order: { createdAt: 'ASC' } });
  }

  async create(kind: CatalogItemKind, label: string): Promise<CatalogItem> {
    const trimmed = label.trim();
    if (!trimmed) throw new ConflictException('Name is required.');
    const key = this.slugify(trimmed);
    if (!key) throw new ConflictException('Name must contain at least one letter or number.');

    const existing = await this.repo.findOne({ where: { kind, key } });
    if (existing) {
      if (existing.isActive) throw new ConflictException(`"${trimmed}" already exists.`);
      // Reactivate rather than duplicate a previously-deactivated entry with
      // the same name.
      existing.isActive = true;
      existing.label = trimmed;
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create({ kind, key, label: trimmed }));
  }

  async isValidKey(kind: CatalogItemKind, key: string): Promise<boolean> {
    return !!(await this.repo.findOne({ where: { kind, key, isActive: true } }));
  }

  private slugify(label: string): string {
    return label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
}
