import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus, SupplySource } from '../../database/entities/order.entity';

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
  @IsEnum(SupplySource, {
    message: `supplySource must be one of: ${Object.values(SupplySource).join(', ')}`,
  })
  supplySource?: SupplySource;
}
