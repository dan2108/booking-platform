export type StaffRole = 'barber' | 'manager' | 'head_office';
export type AppointmentStatus =
  | 'booked'
  | 'in_progress'
  | 'completed'
  | 'no_show'
  | 'cancelled';
export type AppointmentSource = 'online' | 'staff';

export interface Shop {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  timezone: string;
  phone: string | null;
  is_pilot: boolean;
}

export interface Staff {
  id: string;
  shop_id: string | null;
  name: string;
  role: StaffRole;
  initials: string | null;
  bio: string | null;
  is_active: boolean;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_pence: number;
  sort_order: number;
  is_active: boolean;
}

export interface Client {
  id: string;
  name: string | null;
  mobile: string | null;
  email: string | null;
  no_show_count: number;
  home_shop_id: string | null;
}

export interface Appointment {
  id: string;
  shop_id: string;
  barber_id: string;
  client_id: string | null;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  at_risk: boolean;
  started_at: string | null;
  notes: string | null;
}

export interface AppointmentWithDetail extends Appointment {
  client: Pick<Client, 'id' | 'name' | 'mobile' | 'no_show_count'> | null;
  service: Pick<Service, 'id' | 'name' | 'duration_minutes' | 'price_pence'>;
  barber?: Pick<Staff, 'id' | 'name' | 'initials'>;
  shop?: Pick<Shop, 'id' | 'name' | 'slug'>;
}

/** Every documented outcome of reserve(). Mirrors 0004_reservation_engine.sql. */
export type ReserveCode =
  | 'slot_taken'
  | 'outside_rota'
  | 'too_soon'
  | 'in_past'
  | 'mobile_required'
  | 'unknown_service'
  | 'barber_shop_mismatch';

export type ReserveResult =
  | {
      ok: true;
      appointment_id: string;
      client_id: string | null;
      starts_at: string;
      ends_at: string;
      status: AppointmentStatus;
    }
  | { ok: false; code: ReserveCode; message: string };
