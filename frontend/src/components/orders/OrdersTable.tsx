import React, { useState } from 'react';
import { Order, STATUS_CONFIG, StoneStatus, getFactoryDisplay, getSupplySourceDisplay, getCadSubLabel } from '../../utils/types';
import { formatCurrency } from '../../utils/format';

interface OrdersTableProps {
  orders: Partial<Order>[];
  hideFinancials?: boolean;
  thumbnails: Record<string, string>;
  onRowClick: (order: Partial<Order>) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  isSelectable?: (order: Partial<Order>) => boolean;
}

type SortKey = 'po' | 'customer' | 'price' | 'age';

function isPriority(order: Partial<Order>): boolean {
  const fin = ['COMPLETED', 'DELIVERED', 'CANCELLED'];
  return Boolean((order as any).isPriorityCustomer) && !fin.includes(order.status!);
}

const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-card)' };
const tdStyle: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--border-light)', fontSize: '13px', verticalAlign: 'middle' };

function SortableHeader({ label, active, dir, onClick, align }: { label: string; active: boolean; dir: 1 | -1; onClick: () => void; align?: 'right' }) {
  return (
    <th
      onClick={onClick}
      style={{ ...thStyle, textAlign: align || 'left', cursor: 'pointer', color: active ? 'var(--text-secondary)' : thStyle.color, userSelect: 'none' }}
    >
      {label}
      <span style={{ marginLeft: '4px', fontSize: '9px', opacity: active ? 1 : 0.4, color: active ? 'var(--accent-dark)' : undefined }}>
        {active && dir === -1 ? '▴' : '▾'}
      </span>
    </th>
  );
}

const Chip: React.FC<{ text: string; color: string; bg: string }> = ({ text, color, bg }) => (
  <span style={{ fontSize: '10px', fontWeight: 700, borderRadius: '5px', padding: '2px 7px', whiteSpace: 'nowrap', color, background: bg }}>
    {text}
  </span>
);

export const OrdersTable: React.FC<OrdersTableProps> = ({ orders, hideFinancials, thumbnails, onRowClick, selectMode, selectedIds, onToggleSelect, isSelectable }) => {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  };

  const daysSince = (createdAt?: string) => createdAt ? Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)) : null;

  const sorted = [...orders];
  if (sortKey) {
    sorted.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case 'po': av = a.poNumber || ''; bv = b.poNumber || ''; break;
        case 'customer': av = a.storeName || a.customerFullName || ''; bv = b.storeName || b.customerFullName || ''; break;
        case 'price': av = a.quotedCost || 0; bv = b.quotedCost || 0; break;
        case 'age': av = a.createdAt ? new Date(a.createdAt).getTime() : 0; bv = b.createdAt ? new Date(b.createdAt).getTime() : 0; break;
      }
      if (typeof av === 'string') return av.localeCompare(bv as string) * sortDir;
      return (av - (bv as number)) * sortDir;
    });
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {selectMode && <th style={{ ...thStyle, width: '36px' }}></th>}
              <th style={{ ...thStyle, width: '56px' }}></th>
              <SortableHeader label="PO Number" active={sortKey === 'po'} dir={sortDir} onClick={() => toggleSort('po')} />
              <SortableHeader label="Customer / Store" active={sortKey === 'customer'} dir={sortDir} onClick={() => toggleSort('customer')} />
              <th style={thStyle}>Product</th>
              {!hideFinancials && <SortableHeader label="Price" active={sortKey === 'price'} dir={sortDir} onClick={() => toggleSort('price')} align="right" />}
              <th style={thStyle}>Fulfillment</th>
              <th style={thStyle}>Status</th>
              <SortableHeader label="Age" active={sortKey === 'age'} dir={sortDir} onClick={() => toggleSort('age')} />
              <th style={thStyle}>Rep</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(order => {
              const cfg = STATUS_CONFIG[order.status!] || { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
              const cadSubLabel = order.status === 'CAD_IN_PROGRESS' ? getCadSubLabel(order as any) : null;
              const priority = isPriority(order);
              const age = daysSince(order.createdAt);
              const thumb = order.id ? thumbnails[order.id] : undefined;
              const selected = order.id ? selectedIds?.has(order.id) : false;
              const selectable = isSelectable ? isSelectable(order) : true;
              const assignedFactory = (order as any).assignedFactory;
              const stoneStatus = (order as any).stoneStatus;

              return (
                <tr
                  key={order.id}
                  onClick={() => {
                    if (selectMode) { if (selectable && order.id) onToggleSelect?.(order.id); return; }
                    onRowClick(order);
                  }}
                  style={{
                    cursor: selectMode && !selectable ? 'default' : 'pointer',
                    opacity: selectMode && !selectable ? 0.45 : 1,
                    transition: 'background 0.1s, opacity 0.15s',
                    boxShadow: priority ? 'inset 3px 0 0 var(--accent)' : undefined,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {selectMode && (
                    <td style={tdStyle}>
                      {selectable && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%',
                          background: selected ? 'var(--accent)' : 'var(--bg-card)', border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                        }}>
                          {selected && <span style={{ color: '#fff', fontSize: '11px', lineHeight: 1, fontWeight: 700 }}>✓</span>}
                        </span>
                      )}
                    </td>
                  )}
                  <td style={tdStyle}>
                    {thumb ? (
                      <img src={thumb} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px dashed var(--border)' }} />
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '13px' }}>
                      {priority && <span style={{ color: 'var(--accent-dark)', fontSize: '11px', marginRight: '2px' }}>★</span>}
                      {order.poNumber}
                    </span>
                    <span style={{ display: 'block', fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {order.kiraSkuNumber || (order.refCustomerPo ? `Cust PO# ${order.refCustomerPo}` : '')}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.storeName || order.customerFullName || ''}>
                    {order.storeName || order.customerFullName || 'Unknown'}
                  </td>
                  <td style={tdStyle}>
                    {order.orderType && <span style={{ fontWeight: 600 }}>{order.orderType}</span>}
                    {order.metalType && order.metalColor && <span style={{ color: 'var(--text-muted)' }}> · {order.metalType} · {order.metalColor}</span>}
                  </td>
                  {!hideFinancials && (
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--accent-dark)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {order.quotedCost ? formatCurrency(order.quotedCost) : ''}
                    </td>
                  )}
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '260px' }}>
                      {order.status === 'VPO_ISSUED' && (!assignedFactory || !order.supplySource) && (
                        <Chip text="Assign Supplier" color="#0369A1" bg="rgba(14,165,233,0.1)" />
                      )}
                      {order.status === 'VPO_ISSUED' && assignedFactory && order.supplySource && stoneStatus !== StoneStatus.STONE_RECEIVED && (
                        <Chip text="Pending Stone" color="#5B21B6" bg="rgba(124,58,237,0.1)" />
                      )}
                      {stoneStatus === StoneStatus.STONE_RECEIVED && order.status === 'VPO_ISSUED' && assignedFactory && order.supplySource && (
                        <Chip text="Stone Received" color="#065F46" bg="rgba(16,185,129,0.1)" />
                      )}
                      {assignedFactory && (
                        <Chip text={getFactoryDisplay(assignedFactory).label} color={getFactoryDisplay(assignedFactory).color} bg={getFactoryDisplay(assignedFactory).bg} />
                      )}
                      {order.supplySource && (
                        <Chip text={getSupplySourceDisplay(order.supplySource).label} color={getSupplySourceDisplay(order.supplySource).color} bg={getSupplySourceDisplay(order.supplySource).bg} />
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ background: cfg.bg, color: cfg.color, padding: '3px 9px', borderRadius: '99px', fontSize: '10.5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {cadSubLabel || cfg.label}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {age !== null && (
                      <span style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '3px 9px', borderRadius: '99px', fontSize: '10.5px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {String(age).padStart(2, '0')}d
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {order.salesRepName || order.salesRepEmail}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
