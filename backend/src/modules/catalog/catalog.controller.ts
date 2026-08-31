import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { CatalogService } from './catalog.service';
import { CatalogItemKind } from '../../database/entities/catalog-item.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

class CreateCatalogItemDto {
  @IsString() @IsNotEmpty() label: string;
}

@ApiTags('Catalog')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}

  @Get('factories')
  @ApiOperation({ summary: 'List factories orders/staff can be assigned to' })
  findFactories() {
    return this.svc.findAll(CatalogItemKind.FACTORY);
  }

  @Get('supply-sources')
  @ApiOperation({ summary: 'List stone suppliers orders/staff can be assigned to' })
  findSupplySources() {
    return this.svc.findAll(CatalogItemKind.SUPPLY_SOURCE);
  }

  @Post('factories')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Add a new factory to the assignable list (Admin only)' })
  createFactory(@Body() body: CreateCatalogItemDto) {
    return this.svc.create(CatalogItemKind.FACTORY, body.label);
  }

  @Post('supply-sources')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Add a new stone supplier to the assignable list (Admin only)' })
  createSupplySource(@Body() body: CreateCatalogItemDto) {
    return this.svc.create(CatalogItemKind.SUPPLY_SOURCE, body.label);
  }
}
