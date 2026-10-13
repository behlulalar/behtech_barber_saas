import type { Service, Staff } from '../types/api'

class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail)
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Bilinmeyen hata' }))
    throw new ApiError(response.status, body.detail ?? 'Bilinmeyen hata')
  }

  return response.json()
}

export const api = {
  getStaff: () => request<Staff[]>('/staff'),
  getServices: () => request<Service[]>('/services'),
  getBookedTimes: (staffId: number, date: string) =>
    request<string[]>(`/booked-times?staff_id=${staffId}&date=${date}`),
  sendCode: (phone: string) =>
    request<{ message: string; kod: string }>('/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  verifyCode: (phone: string, code: string) =>
    request<{ message: string }>('/auth/verify_code', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    }),
  createAppointment: (data: {
    phone: string
    name: string
    surname: string
    staff_id: number
    service_id: number
    appointment_date: string
    appointment_time: string
  }) =>
    request('/appointments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

export { ApiError }
