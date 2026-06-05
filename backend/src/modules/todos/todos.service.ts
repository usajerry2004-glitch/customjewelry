import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Todo, TodoPriority } from '../../database/entities/todo.entity';

@Injectable()
export class TodosService {
  constructor(@InjectRepository(Todo) private readonly repo: Repository<Todo>) {}

  findAll(userId: string): Promise<Todo[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async create(userId: string, dto: { title: string; priority?: TodoPriority; dueDate?: string }): Promise<Todo> {
    const todo = this.repo.create({ userId, title: dto.title, priority: dto.priority ?? TodoPriority.MEDIUM, dueDate: dto.dueDate ?? null });
    return this.repo.save(todo);
  }

  async update(id: string, userId: string, dto: Partial<{ title: string; isCompleted: boolean; priority: TodoPriority; dueDate: string | null }>): Promise<Todo> {
    const todo = await this.repo.findOne({ where: { id } });
    if (!todo) throw new NotFoundException('Todo not found');
    if (todo.userId !== userId) throw new ForbiddenException();
    Object.assign(todo, dto);
    return this.repo.save(todo);
  }

  async remove(id: string, userId: string): Promise<void> {
    const todo = await this.repo.findOne({ where: { id } });
    if (!todo) throw new NotFoundException('Todo not found');
    if (todo.userId !== userId) throw new ForbiddenException();
    await this.repo.remove(todo);
  }
}
