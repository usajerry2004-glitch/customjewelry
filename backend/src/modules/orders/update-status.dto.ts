import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus, SupplySource, Factory } from '../../database/entities/order.entity';

export class UpdateStatusDto {
  @IsEnum(OrderStatus, {
    message: `status must be one of: ${Object.values(OrderStatus).join(', ')}`,
  })
  status: OrderStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quotedCost?: number;

  @IsOptional()
  @IsString()
  repairContractor?: string;

  @IsOptional()
  @IsString()
  customerCode?: string;
}

export class AssignSupplierDto {
  @IsEnum(Factory, {
    message: `factory must be one of: ${Object.values(Factory).join(', ')}`,
  })
  factory: Factory;

  @IsEnum(SupplySource, {
    message: `supplySource must be one of: ${Object.values(SupplySource).join(', ')}`,
  })
  supplySource: SupplySource;
}

export class BulkAssignSupplierDto extends AssignSupplierDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  orderIds: string[];
}
