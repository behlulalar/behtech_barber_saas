import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'

interface Props {
  name: string
  detail?: string
  onContinue: () => void
  onSwitch: () => void
}

/** Giriş sayfasında, oturumu açık hesabı gösterir: "Devam et" ya da başka hesapla giriş. */
export function RememberedAccount({ name, detail, onContinue, onSwitch }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-sm border border-line-strong bg-surface-raised p-4">
        <Avatar name={name} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg text-cream">{name}</p>
          {detail && <p className="truncate text-sm text-muted-strong">{detail}</p>}
        </div>
      </div>
      <Button type="button" size="lg" fullWidth onClick={onContinue}>
        {name.split(' ')[0]} olarak giriş yap
      </Button>
      <button type="button" onClick={onSwitch} className="-mt-2 min-h-11 text-sm text-muted-strong underline-offset-4 hover:text-cream hover:underline">
        Başka hesapla giriş yap
      </button>
    </div>
  )
}
