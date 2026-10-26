/* store.js — البيانات اللي في الذاكرة + فهارس سريعة */
import { useState, useEffect } from './ui.js?v=4';
import { call } from './api.js?v=4';
import { norm } from './lib.js?v=4';

let S = { data: null, idx: null, loading: false, err: '' };
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  return S;
}
export const getStore = () => S;
export function resetStore() { S = { data: null, idx: null, loading: false, err: '' }; emit(); }

function byId(arr) { const m = new Map(); (arr || []).forEach((x) => m.set(x.id, x)); return m; }

function build(d) {
  const items = byId(d.items), drivers = byId(d.drivers), cars = byId(d.cars);
  const trips = byId(d.trips), templates = byId(d.templates), customers = byId(d.customers), shipments = byId(d.shipments);
  const byCode = new Map(); d.items.forEach((i) => { if (i.code) byCode.set(i.code, i); });
  const carsByDriver = new Map(); d.cars.forEach((c) => { if (!carsByDriver.has(c.driver_id)) carsByDriver.set(c.driver_id, []); carsByDriver.get(c.driver_id).push(c); });
  const itemsByDriver = new Map();
  const kinds = { part: [], tool: [], product: [] };
  d.items.forEach((i) => {
    kinds[i.kind].push(i);
    if (i.driver_id) { if (!itemsByDriver.has(i.driver_id)) itemsByDriver.set(i.driver_id, []); itemsByDriver.get(i.driver_id).push(i); }
  });
  /* برا في طلعة (اتخصم من الجراش) / محجوز في طلعة بتتحضّر */
  const outQty = new Map(), prepQty = new Map(), outTrips = new Map();
  d.trips.forEach((t) => {
    if (t.status === 'closed') return;
    t.items.forEach((x) => {
      const m = t.status === 'out' ? outQty : prepQty;
      m.set(x.item_id, (m.get(x.item_id) || 0) + x.qty);
      if (!outTrips.has(x.item_id)) outTrips.set(x.item_id, []);
      outTrips.get(x.item_id).push({ trip: t, qty: x.qty });
    });
  });
  const shipQty = new Map();
  d.shipments.forEach((s) => { if (s.status === 'draft') s.items.forEach((x) => shipQty.set(x.item_id, (shipQty.get(x.item_id) || 0) + x.qty)); });
  const cats = { part: [], tool: [], product: [] };
  d.categories.forEach((c) => cats[c.kind] && cats[c.kind].push(c.name));
  const locations = [...new Set(d.items.map((i) => i.location).filter(Boolean))].sort();
  /* نص البحث لكل حاجة */
  const hay = new Map();
  d.items.forEach((i) => {
    const dr = i.driver_id && drivers.get(i.driver_id);
    const car = i.car_id && cars.get(i.car_id);
    hay.set(i.id, norm([i.code, i.name, i.name_en, i.category, i.size, i.location, i.note, dr && dr.name, car && car.name].join(' ')));
  });
  return { items, drivers, cars, trips, templates, customers, shipments, byCode, carsByDriver, itemsByDriver, kinds, outQty, prepQty, outTrips, shipQty, cats, locations, hay };
}

let pending = null;
export async function reload() {
  if (pending) return pending;
  S = { ...S, loading: true }; emit();
  pending = (async () => {
    try {
      const d = await call('bootstrap');
      S = { data: d, idx: build(d), loading: false, err: '' };
    } catch (e) {
      S = { ...S, loading: false, err: e && e.message ? e.message : String(e) };
      throw e;
    } finally {
      pending = null;
      emit();
    }
    return S.data;
  })();
  return pending;
}

/* ---------- مساعدات ---------- */
export function ownerText(item, idx) {
  if (!item) return '';
  if (item.kind === 'tool') return 'ملك الجراش';
  if (item.kind === 'product') return 'منتج تصدير';
  const d = idx.drivers.get(item.driver_id);
  const c = item.car_id && idx.cars.get(item.car_id);
  return (d ? d.name : '—') + (c ? ' · ' + c.name : '');
}
export const isAdmin = () => !!(S.data && S.data.me && S.data.me.kind === 'admin');
export const meName = () => (S.data && S.data.me ? S.data.me.name : '');
