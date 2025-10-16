export interface IDonate {
  id?: number; // serial primary key
  item?: string; // bpchar
  description?: string; // bpchar
  price?: number; // bigint
  item_id?: number; // bigint
  field?: string; // bpchar
  operator?: string; // bpchar
  prev?: boolean; // bpchar
  tables?: string; // bpchar
}