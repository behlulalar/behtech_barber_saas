import { Download } from 'lucide-react'
import { useState } from 'react'
import { useInstallPrompt } from '../lib/pwa'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

/** "Uygulamayı yükle": Chrome/Edge'de yerel istem, iOS Safari'de kısa yönerge. Yüklüyse ya da desteklenmiyorsa görünmez. */
export function InstallButton() {
  const { mode, promptInstall } = useInstallPrompt()
  const [iosHelp, setIosHelp] = useState(false)
  if (!mode) return null
  return (
    <>
      <button
        type="button"
        onClick={() => (mode === 'native' ? void promptInstall() : setIosHelp(true))}
        className="mt-1 inline-flex min-h-11 w-full items-center justify-start gap-2 rounded-sm px-3 text-sm font-medium text-muted-strong transition-colors hover:bg-panel-raised hover:text-cream"
      >
        <Download className="size-[18px] shrink-0" aria-hidden="true" />
        <span>Uygulamayı yükle</span>
      </button>
      <Modal
        open={iosHelp}
        onClose={() => setIosHelp(false)}
        size="sm"
        title="Uygulamayı yükle"
        footer={<Button onClick={() => setIosHelp(false)}>Tamam</Button>}
      >
        <p className="pb-2 text-sm text-muted-strong">Safari'de Paylaş simgesine dokunun, sonra 'Ana Ekrana Ekle'yi seçin.</p>
      </Modal>
    </>
  )
}
