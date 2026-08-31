import { Factory } from '../../database/entities/order.entity';

// Standing distribution list for the Creations factory — always notified
// when an order is routed there, on top of whatever FACTORY_MANAGER accounts
// are tagged to Creations in the system. These addresses intentionally have
// no corresponding User row: they're plain email recipients, not accounts,
// and none should ever be auto-created for them.
const CREATIONS_RECIPIENTS: string[] = [
  'deepali@creationjewel.co.in',
  'specialorderdesign@creationjewel.co.in',
  'SpecialorderCAD@creationjewel.co.in',
  'rajendra@creationjewel.co.in',
  'diamond2@creationjewel.co.in',
  'diamond@creationjewel.co.in',
  'specialorder@creationjewel.co.in',
  'Santosh@creationjewel.co.in',
  'production@creationjewel.co.in',
];

const JEWEL_ONE_RECIPIENTS: string[] = [
  'ujjwal.yadav@jewelone.com',
  'chirag.mehta@jewelone.com',
];

export const STANDING_FACTORY_RECIPIENTS: Partial<Record<string, string[]>> = {
  [Factory.CREATIONS]: CREATIONS_RECIPIENTS,
  [Factory.JEWEL_ONE]: JEWEL_ONE_RECIPIENTS,
};
