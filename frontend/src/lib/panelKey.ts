// Gizli personel giriş anahtarı (`/panel/g/<key>`). Origin dükkân başına ayrı olduğu için
// localStorage'da tek anahtar yeter; panele oturumsuz gelen kullanıcıyı buraya yönlendiririz.

const STORAGE_KEY = 'panelKey'

export function getPanelKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function setPanelKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    /* gizli mod vb. — yoksay */
  }
}

export function clearPanelKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* yoksay */
  }
}

export function panelLoginPath(key: string): string {
  return `/panel/g/${encodeURIComponent(key)}`
}
