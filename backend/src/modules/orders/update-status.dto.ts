import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsNotEmpty, Min, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../../database/entities/order.entity';

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
  // Validated against the catalog (not a fixed enum) in OrdersService.assignSupplier —
  // the assignable list now grows via Settings > "+ Add Factory"/"+ Add Stone Supplier".
  @IsString() @IsNotEmpty()
  factory: string;

  @IsString() @IsNotEmpty()
  supplySource: string;
}

export class BulkAssignSupplierDto extends AssignSupplierDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  orderIds: string[];
}
