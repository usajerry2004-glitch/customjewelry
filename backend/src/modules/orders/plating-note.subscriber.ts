import { Injectable } from '@nestjs/common';
import { DataSource, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';
import { Order } from '../../database/entities/order.entity';
import { withPlatingNote } from '../../database/entities/plating-note';
import { withDsNote } from '../../database/entities/ds-order';

// 61F/62F SKUs are plated silver — make sure the order note says so,
// whichever path created or edited the order (website, dropship, web form,
// import, staff edit). Runs on every repository save() of an Order.
@Injectable()
export class PlatingNoteSubscriber implements EntitySubscriberInterface<Order> {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return Order;
  }

  beforeInsert(event: InsertEvent<Order>) {
    this.apply(event.entity);
  }

  beforeUpdate(event: UpdateEvent<Order>) {
    if (event.entity) this.apply(event.entity as Order);
  }

  private apply(order: Partial<Order>) {
    const next = withPlatingNote(order);
    if (next !== null) order.customerNotes = next;
    // DS line goes on top of everything, plating line included.
    const ds = withDsNote(order);
    if (ds !== null) order.customerNotes = ds;
  }
}
