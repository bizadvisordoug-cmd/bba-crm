import type { SupabaseClient } from '@supabase/supabase-js'

// Shared email-image helpers.
//
// Campaign step bodies are stored as plain text with raw <img> tags embedded.
// Both editors — the full step editor (CampaignStepModal) and the step builder
// inside the create wizard (CampaignCreateModal) — must emit byte-identical
// markup, or a tag written by one will not parse back out in the other.

export const HEADER_MAX_W = 600
export const BODY_MAX_W   = 560

export type ImgAlign = 'left' | 'center' | 'right'

/** Uploads to the public `email-images` bucket and returns the public URL. */
export async function uploadEmailImage(
  supabase: SupabaseClient,
  file: File,
  folder: 'headers' | 'body',
): Promise<string> {
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('email-images')
    .upload(path, file, { upsert: false })
  if (error) throw error
  return supabase.storage.from('email-images').getPublicUrl(path).data.publicUrl
}

/**
 * Builds the <img> tag written into a step body.
 *
 * The shape here is what parseBodyImages() in CampaignStepModal reads back —
 * it needs src, a width in px, height (auto when ratio-locked) and data-align.
 */
export function buildBodyImgTag({
  url,
  width,
  height,
  lockRatio,
  align,
}: {
  url: string
  width: number
  height: number
  lockRatio: boolean
  align: ImgAlign
}): string {
  const heightStyle = lockRatio ? 'height:auto' : `height:${height}px`
  const margin =
    align === 'left'  ? '12px auto 12px 0' :
    align === 'right' ? '12px 0 12px auto' :
                        '12px auto'
  return `<img src="${url}" alt="" data-align="${align}" style="width:${width}px;${heightStyle};max-width:100%;display:block;margin:${margin};text-align:${align};">`
}

/** Loads an image to read its natural pixel dimensions. */
export function measureImage(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const el = new window.Image()
    el.onload  = () => resolve({ w: el.naturalWidth || 0, h: el.naturalHeight || 0 })
    el.onerror = reject
    el.src = url
  })
}
