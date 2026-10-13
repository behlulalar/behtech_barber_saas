// Gerçek berber/personel fotoğrafları eklenene kadar kullanılan,
// ticari kullanıma uygun (Unsplash License) örnek görseller.
// Kaynak: unsplash.com — Redd Francisco, Abhishek Rai, Diana Simumpande.

export const HERO_IMAGE =
  'https://images.unsplash.com/photo-1672642150228-3fcd5826ec26?auto=format&fit=crop&w=1200&q=80'

const STAFF_IMAGES = [
  'https://images.unsplash.com/photo-1642795730901-84f82e088e17?auto=format&fit=crop&w=600&h=600&q=80',
  'https://images.unsplash.com/photo-1614247521228-d4184c975eff?auto=format&fit=crop&w=600&h=600&q=80',
  'https://images.unsplash.com/photo-1649433658557-54cf58577c68?auto=format&fit=crop&w=600&h=600&q=80',
]

export function staffImageFor(staffId: number): string {
  return STAFF_IMAGES[staffId % STAFF_IMAGES.length]
}
