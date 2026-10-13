export interface Staff {
  id: number
  tenant_id: number
  name: string
  surname: string
  phone: string
  created_at: string | null
}

export interface Service {
  id: number
  name: string
  price: number
  duration_min: number
}

export interface Tenant {
  id: number
  name: string
  slug: string
  created_at: string
  is_active: boolean
}
