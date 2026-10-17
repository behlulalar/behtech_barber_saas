import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'

export function LoadError({ onRetry, text }: { onRetry: () => void; text: string }) {
  return (
    <EmptyState
      title={text}
      description="İnternet bağlantınızı kontrol edip tekrar deneyin."
      action={
        <Button variant="secondary" onClick={onRetry}>
          Tekrar dene
        </Button>
      }
    />
  )
}
