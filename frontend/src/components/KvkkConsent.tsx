import { useState } from 'react'
import { LEGAL_VERSIONS } from '../lib/legal'
import { Checkbox } from './ui/Checkbox'

const KEY = `kvkk:${LEGAL_VERSIONS.customerPrivacy}`

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function write(v: boolean) {
  try {
    if (v) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* depolama kapalı olabilir */
  }
}

/** Aydınlatma metni onayı: sürüm başına tarayıcıda hatırlanır. */
export function useKvkkConsent() {
  const [accepted, setAcceptedState] = useState(read)
  const setAccepted = (v: boolean) => {
    setAcceptedState(v)
    write(v)
  }
  return [accepted, setAccepted] as const
}

export const KVKK_REQUIRED_MESSAGE = 'Devam etmek için Aydınlatma Metni\'ni okuduğunuzu onaylayın.'

export function KvkkCheckbox({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string | null }) {
  return (
    <div>
      <Checkbox
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={error ? true : undefined}
        label={
          <>
            <a
              href="/yasal/aydinlatma"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-copper-bright underline underline-offset-4"
            >
              Aydınlatma Metni
            </a>
            'ni okudum, kişisel verilerimin işlenmesini anladım.
          </>
        }
      />
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
