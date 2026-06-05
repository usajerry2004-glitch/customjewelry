import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly config: ConfigService) {}

  async dumpBeforeSync(label = 'sync'): Promise<string> {
    const backupDir = join(process.cwd(), 'backups');
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `jewelflow-${label}-${ts}.sql`;
    const filePath = join(backupDir, fileName);

    const host     = this.config.get('DB_HOST', 'localhost');
    const port     = this.config.get('DB_PORT', '5432');
    const user     = this.config.get('DB_USERNAME', 'jewelflow');
    const password = this.config.get('DB_PASSWORD', 'jewelflow123');
    const dbName   = this.config.get('DB_NAME', 'jewelflow');

    // pg_dump path for Windows PostgreSQL 17
    const pgDump = existsSync('C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe')
      ? '"C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe"'
      : 'pg_dump';

    const cmd = `${pgDump} -h ${host} -p ${port} -U ${user} -d ${dbName} -F p -f "${filePath}"`;

    try {
      execSync(cmd, {
        env: { ...process.env, PGPASSWORD: password },
        stdio: 'pipe',
      });
      this.logger.log(`Backup created: ${filePath}`);
      return filePath;
    } catch (err) {
      this.logger.error(`Backup failed: ${err.message}`);
      throw new Error(`Database backup failed before ${label}: ${err.message}`);
    }
  }
}
