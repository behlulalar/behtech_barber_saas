import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { customerApi, errorMessage, publicApi, ApiError } from '../../lib/api'
import { LIVE_SLOTS_QUERY, useDropStaleSelection } from '../../lib/useLiveSlots'
import { formatDateLong, formatTimeRange, nextDaysISO, todayLocalISO } from '../../lib/format'
import type { AppointmentPublicOut } from '../../types/api'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { TimeStep } from './TimeStep'

const DAYS = 14

/** Müşterinin kendi randevusunu aynı hizmet ve berberde başka güne/saate alması. */
export function RescheduleModal({ appointment, onClose }: { appointment: AppointmentPublicOut; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const days = useMemo(() => nextDaysISO(DAYS), [])
  const [date, setDate] = useState(() => (days.includes(appointment.appointment_date) ? appointment.appointment_date : todayLocalISO()))
  const [time, setTime] = useState<string | null>(null)

  const slots = useQuery({
    queryKey: ['availability', 'slots', appointment.staff.id, appointment.service.id, date],
    queryFn: () => publicApi.getSlots({ staff_id: appointment.staff.id, service_id: appointment.service.id, date }),
    ...LIVE_SLOTS_QUERY,
  })
  useDropStaleSelection(slots.data, time, () => setTime(null))

  const move = useMutation({
    mutationFn: () => customerApi.rescheduleAppointment(appointment.id, { appointment_date: date, appointment_time: time!.slice(0, 5) }),
    onSuccess: () => {
      toast.success('Randevunuz güncellendi')
      void queryClient.invalidateQueries({ queryKey: ['customer', 'appointments'] })
      void queryClient.invalidateQueries({ queryKey: ['availability'] })
      onClose()
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      if (err instanceof ApiError && err.status === 409) {
        setTime(null)
        void slots.refetch()
      }
    },
  })

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!move.isPending}
      size="md"
      title="Randevu saatini değiştir"
      description={`${appointment.service.name} · ${formatDateLong(appointment.appointment_date)}, ${formatTimeRange(appointment.appointment_time, appointment.service.duration_min)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={move.isPending}>
            Vazgeç
          </Button>
          <Button onClick={() => move.mutate()} loading={move.isPending} disabled={!time}>
            Saati değiştir
          </Button>
        </>
      }
    >
      <TimeStep
        days={days}
        date={date}
        onDate={(d) => {
          setDate(d)
          setTime(null)
        }}
        time={time}
        onTime={setTime}
        data={slots.data}
        loading={slots.isLoading}
        error={slots.isError}
        onRetry={() => slots.refetch()}
      />
    </Modal>
  )
}
