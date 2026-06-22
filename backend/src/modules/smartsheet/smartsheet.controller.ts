import {
  Controller, Get, Post, Delete, Query, Param, Body,
  UseGuards, Headers, Res, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { SmartsheetService } from './smartsheet.service';
import { SmartsheetImportService } from './smartsheet-import.service';
import { SmartsheetWebhookService } from './smartsheet-webhook.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('Smartsheet')
@ApiBearerAuth()
@Controller('smartsheet')
export class SmartsheetController {
  constructor(
    private readonly smartsheetService: SmartsheetService,
    private readonly importService: SmartsheetImportService,
    private readonly webhookService: SmartsheetWebhookService,
    private readonly config: ConfigService,
  ) {}

  // ── Import ────────────────────────────────────────────────────────────────

  @Post('import')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Import orders from Smartsheet — Admin/Authorizer only' })
  @ApiQuery({ name: 'from', required: false, example: '2026-05-15' })
  @ApiQuery({ name: 'to',   required: false, example: '2026-05-31' })
  runImport(
    @Query('from') from = '2026-05-15',
    @Query('to')   to   = '2026-05-31',
  ) {
    const sheetId = this.config.get('SMARTSHEET_SHEET_ID', '2085580205674372');
    return this.importService.importMayOrders(sheetId, from, to);
  }

  @Post('import/rows')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Import specific Smartsheet rows by row ID — bypasses date filter' })
  importRows(@Body() body: { rowIds: string[] }) {
    const sheetId = this.config.get('SMARTSHEET_SHEET_ID', '2085580205674372');
    return this.importService.importByRowIds(sheetId, body.rowIds);
  }

  @Post('import/patch-media')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Patch reference images + comments onto already-imported orders. Omit from/to to process all rows.' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (omit to process all rows)' })
  @ApiQuery({ name: 'to',   required: false, description: 'End date (omit to process all rows)' })
  patchMedia(
    @Query('from') from?: string,
    @Query('to')   to?:   string,
  ) {
    const sheetId = this.config.get('SMARTSHEET_SHEET_ID', '2085580205674372');
    return this.importService.patchMediaAndComments(sheetId, from, to);
  }

  @Post('sync-comments/:orderId')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Sync Smartsheet conversations for a specific portal order' })
  syncComments(@Param('orderId') orderId: string) {
    const sheetId = this.config.get('SMARTSHEET_SHEET_ID', '2085580205674372');
    return this.importService.syncCommentsForOrder(orderId, sheetId);
  }

  // ── Smart sync: update existing + import only new rows ───────────────────

  @Post('smart-sync')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Update already-imported orders + import new Smartsheet rows; skip old rows never imported' })
  smartSync() {
    const sheetId = this.config.get('SMARTSHEET_SHEET_ID', '2085580205674372');
    return this.importService.smartSync(sheetId);
  }

  // ── Manual sync (re-pulls latest status + fields for all imported orders) ─

  @Post('sync')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Re-sync all imported orders from current Smartsheet data' })
  @ApiQuery({ name: 'from', required: false, description: 'Filter rows by Smartsheet row createdAt (optional)' })
  @ApiQuery({ name: 'to',   required: false })
  syncAll(
    @Query('from') from?: string,
    @Query('to')   to?: string,
  ) {
    return this.webhookService.syncAll(from, to);
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  @Post('webhook/register')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Register a Smartsheet webhook for live sync — Admin only' })
  registerWebhook() {
    return this.webhookService.registerWebhook();
  }

  @Get('webhook/list')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'List all registered Smartsheet webhooks' })
  listWebhooks() {
    return this.webhookService.listWebhooks();
  }

  @Delete('webhook/:id')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Delete a Smartsheet webhook by ID' })
  deleteWebhook(@Param('id') id: string) {
    return this.webhookService.deleteWebhook(id);
  }

  /**
   * Smartsheet webhook callback — PUBLIC (no JWT).
   * Handles both:
   *   1. Challenge verification: POST with header Smartsheet-Hook-Challenge → respond with same value
   *   2. Row events: POST with JSON payload → sync changed orders
   */
  @Post('webhook/callback')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Smartsheet live-sync callback (public)' })
  async webhookCallback(
    @Headers('smartsheet-hook-challenge') challenge: string,
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (challenge) {
      res.setHeader('Smartsheet-Hook-Response', challenge);
      return { ok: true };
    }
    return this.webhookService.processWebhookEvent(body);
  }

  // ── Data inspection ───────────────────────────────────────────────────────

  @Get('data')
  @ApiOperation({ summary: 'Fetch Smartsheet rows filtered by date range' })
  @ApiQuery({ name: 'from', required: false, example: '2026-05-15' })
  @ApiQuery({ name: 'to',   required: false, example: '2026-05-31' })
  getData(
    @Query('from') from = '2026-05-15',
    @Query('to')   to   = '2026-05-31',
  ) {
    return this.smartsheetService.getFilteredData(from, to);
  }

  @Get('raw')
  @ApiOperation({ summary: 'Fetch full Smartsheet — inspect columns/structure' })
  getRaw(): Promise<object> {
    return this.smartsheetService.fetchSheet();
  }
}
