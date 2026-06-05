import { Controller, Get, Post, Patch, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TodosService } from './todos.service';
import { TodoPriority } from '../../database/entities/todo.entity';

@ApiTags('Todos')
@ApiBearerAuth()
@Controller('todos')
export class TodosController {
  constructor(private readonly svc: TodosService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user todos' })
  findAll(@Request() req: any) {
    return this.svc.findAll(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a todo' })
  create(@Request() req: any, @Body() body: { title: string; priority?: TodoPriority; dueDate?: string }) {
    return this.svc.create(req.user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a todo' })
  update(@Param('id') id: string, @Request() req: any,
    @Body() body: Partial<{ title: string; isCompleted: boolean; priority: TodoPriority; dueDate: string | null }>) {
    return this.svc.update(id, req.user.id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a todo' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.svc.remove(id, req.user.id);
  }
}
